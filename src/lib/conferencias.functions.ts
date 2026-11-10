import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface ConferenciaItem {
  id: number;
  nome: string;
  ramal: string;
  tipo: string;
  max_participantes: number;
  gravar: number | boolean;
  mixing_interval: number;
  permitir_video: number | boolean;
  ativo: number | boolean;
}

const tenantSchema = z.object({ tenant_id: z.number().int().positive().optional() });
export const conferenciaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(120),
  ramal: z.string().trim().regex(/^\d{1,20}$/, "Ramal deve conter apenas números (até 20 dígitos)"),
  max_participantes: z.coerce.number().int().min(2).max(1000),
  gravar: z.boolean(),
  mixing_interval: z.coerce.number().int().min(10).max(1000),
  permitir_video: z.boolean(),
  ativo: z.boolean(),
});
export type ConferenciaInput = z.infer<typeof conferenciaSchema>;

export const listConferencias = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => tenantSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ conferencias: ConferenciaItem[] }>(
      context, "/conferencias", { tenantId },
    );
    return { conferencias: res.conferencias ?? [] };
  });

export const createConferencia = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => tenantSchema.extend(conferenciaSchema.shape).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _tenant, ...body } = data;
    return authenticatedAgentFetch<{ ok: true; id: number }>(context, "/conferencias", {
      method: "POST", tenantId, body,
    });
  });

export const updateConferencia = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => tenantSchema.extend(conferenciaSchema.shape).extend({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { id, tenant_id: _tenant, ...body } = data;
    return authenticatedAgentFetch<{ ok: true }>(context, `/conferencias/${id}`, {
      method: "PUT", tenantId, body,
    });
  });

export const deleteConferencia = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => tenantSchema.extend({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/conferencias/${data.id}`, {
      method: "DELETE", tenantId,
    });
    return { ok: true };
  });
