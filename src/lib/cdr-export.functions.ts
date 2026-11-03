import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "@/lib/tenant.server";
import { authenticatedAgentFetch } from "@/lib/agent.server";
import { createExportTicket } from "@/lib/cdr-export-ticket.server";

const filtersSchema = z.object({
  linkedid: z.string().max(120).optional(),
  origem: z.string().max(80).optional(),
  destino: z.string().max(80).optional(),
  status: z.string().max(80).optional(),
  tipo: z.string().max(80).optional(),
  contexto: z.string().max(64).optional(),
  from: z.string().min(10).max(40),
  to: z.string().min(10).max(40),
});
const startSchema = z.object({
  tenant_id: z.number().int().positive().optional(),
  tipo: z.enum(["geral", "fila", "ura", "ura-ia", "ddd", "satisfacao"]),
  formato: z.enum(["csv", "xlsx"]),
  filters: filtersSchema,
});
const progressSchema = z.object({
  tenant_id: z.number().int().positive().optional(),
  jobId: z.string().uuid(),
});

function validatePeriod(from: string, to: string) {
  const start = Date.parse(from.slice(0, 10) + "T00:00:00Z");
  const end = Date.parse(to.slice(0, 10) + "T00:00:00Z");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    (end - start) / 86400000 + 1 > 31
  ) {
    throw new Error("Selecione um período válido de até 31 dias corridos.");
  }
}

export const iniciarExportacaoCdr = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }) => {
    validatePeriod(data.filters.from, data.filters.to);
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const jobId = randomUUID();
    const filters = Object.fromEntries(
      Object.entries(data.filters).filter(([, v]) => v != null && v !== ""),
    ) as Record<string, string>;
    const ticket = createExportTicket({
      token: context.token,
      tenantId,
      formato: data.formato,
      tipo: data.tipo,
      jobId,
      filters,
      expiresAt: Date.now() + 120000,
    });
    return { jobId, ticket };
  });

export const progressoExportacaoCdr = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: unknown) => progressSchema.parse(data))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);

    try {
      return await authenticatedAgentFetch<{
        status: string;
        processed: number;
        total: number;
        error?: string;
      }>({ token: context.token }, `/cdr/exportar/progresso/${data.jobId}`, { tenantId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // O polling pode chegar antes de o Agent registrar o job.
      if (/Agente PABX retornou 404:/.test(message) && /Exportação não encontrada/.test(message)) {
        return {
          status: "pending",
          processed: 0,
          total: 0,
        };
      }

      // Outros erros continuam sendo propagados.
      throw error;
    }
  });
