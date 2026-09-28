import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

const CdrFilter = z
  .object({
    tenant_id: z.number().int().positive().optional(),
    linkedid: z.string().max(120).optional(),
    origem: z.string().max(80).optional(),
    destino: z.string().max(80).optional(),
    status: z.string().max(80).optional(),
    tipo: z.string().max(80).optional(),
    contexto: z.string().max(64).optional(),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    limit: z.number().int().optional(),
    page: z.number().int().positive().optional(),
    rank: z.boolean().optional(),
    sigla_estado: z.string().optional(),
  })
  .optional()
  .transform((v) => v ?? {});
type CdrFilterT = z.infer<typeof CdrFilter>;

function buildQuery(filters: CdrFilterT, tenantId?: number): string {
  const q = new URLSearchParams();

  // Varre TODAS as chaves que o Zod validou dinamicamente
  for (const [k, v] of Object.entries(filters)) {
    // Ignoramos tenant_id pq ele é injetado separadamente no final
    if (k === "tenant_id" || k === "rank") continue;
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      q.set(k, String(v).trim());
    }
  }
  if (filters.rank) q.set("rank", "true");
  if (tenantId) q.set("tenant", String(tenantId));

  const s = q.toString();
  return s ? `?${s}` : "";
}

async function fetchCdr(path: string, token: string, filters: CdrFilterT) {
  const tenantId = await resolveTenantId(token, filters.tenant_id);
  const qs = buildQuery(filters, tenantId);
  const res = await authenticatedAgentFetch<{
    rows: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({ token }, `${path}${qs}`, { tenantId });
  return {
    tenantId,
    rows: res.rows ?? [],
    total: res.total,
    page: res.page,
    limit: res.limit,
    totalPages: res.totalPages,
  };
}

export const listCdrEntrada = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/entrada", context.token, data));

export const listCdrRamal = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ramal", context.token, data));

export const listCdrFila = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/fila", context.token, data));

export const listCdrUra = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ura", context.token, data));

export const listCdrPesquisa = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/pesquisa", context.token, data));

export const listCdrCidadesEntrada = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/entrada", context.token, data));

export const listCdrCidadesSaida = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/saida", context.token, data));
