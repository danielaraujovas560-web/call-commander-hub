import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

async function writeAuditLog(
  token: string,
  entry: { tenant_id: number; action: string; payload: unknown },
) {
  try {
    const { agentFetch } = await import("./agent.server");
    await agentFetch("/audit-log", { method: "POST", bearerToken: token, body: entry });
  } catch (e) {
    console.warn(`[audit-log] falha ao registrar ${entry.action}:`, e);
  }
}

export interface Ramal {
  ramal: string;
  nome: string | null;
  tronco: string | null;
  ddd: string | null;
  callerid: string | null;
  senha: string | null;
  fixo: boolean;
  movel: boolean;
  ddi: boolean;
  especial: boolean;
  cng: boolean;
  endpoint_id: string | null;
  transbordo: boolean;
  transbordo_tronco: string | null;
  pesquisa: boolean;
  pesquisa_id: number | null;

  ligacoes_feitas: number;
  ligacoes_recebidas: number;
}

const RamalInput = z.object({
  nome: z.coerce.string().trim().max(80).optional().or(z.literal("")),
  ramal: z.coerce
    .string()
    .trim()
    .regex(/^\d{3,6}$/, "Ramal deve ter 3-6 dígitos"),
  senha: z.coerce.string().max(64).optional().or(z.literal("")),
  tronco: z.coerce.string().trim().min(1).max(80),
  ddd: z.coerce.string().trim().min(1).max(3),
  callerid: z.coerce.string().trim().max(32).optional().or(z.literal("")),
  fixo: z.boolean().default(false),
  movel: z.boolean().default(false),
  ddi: z.boolean().default(false),
  especial: z.boolean().default(false),
  cng: z.boolean().default(false),
  transbordo: z.boolean().default(false),
  transbordo_tronco: z.coerce.string().max(400).optional().or(z.literal("")),
  pesquisa: z.boolean().default(false),
  pesquisa_id: z.number().int().positive().optional().nullable(),
  tenant_id: z.number().int().positive().optional(),
});

const TenantOnly = z
  .object({ tenant_id: z.number().int().positive().optional() })
  .optional()
  .transform((v) => v ?? {});

export const listRamais = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await agentFetch<{ ramais: Ramal[] }>(`/ramais?tenant=${tenantId}`, {
      tenantId,
      bearerToken: context.token,
    });
    return { tenantId, ramais: res.ramais ?? [] };
  });

export const createRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => RamalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _ignore, ...payload } = data;

    const created = await agentFetch<{ ramal: Ramal }>("/ramais", {
      method: "POST",
      tenantId,
      body: payload,
    });

    await writeAuditLog(context.token, {
      tenant_id: tenantId,
      action: "ramal.create",
      payload: { ramal: data.ramal, nome: data.nome },
    });

    return created;
  });

const RamalUpdateInput = z.object({
  endpoint_id: z.string(),
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().max(80).optional(),
  senha: z.coerce.string().max(64).optional(),
  tronco: z.coerce.string().trim().min(1).max(80).optional(),
  ddd: z.coerce.string().trim().min(1).max(3).optional(),
  callerid: z.coerce.string().trim().max(32).optional().or(z.literal("")),
  fixo: z.boolean().optional(),
  movel: z.boolean().optional(),
  ddi: z.boolean().optional(),
  especial: z.boolean().optional(),
  cng: z.boolean().optional(),
  gravacao: z.boolean().optional(),
  transbordo: z.boolean().optional(),
  transbordo_tronco: z.coerce.string().max(400).optional().or(z.literal("")).or(z.null()),
  pesquisa: z.boolean().optional(),
  pesquisa_id: z.number().int().positive().optional().or(z.null()),
});

export const updateRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => RamalUpdateInput.parse(input))
  .handler(async ({ data: input, context }) => {
    const { agentFetch } = await import("./agent.server");
    const { endpoint_id, tenant_id, ...patch } = input;
    const tenantId = await resolveTenantId(context.token, tenant_id);
    const res = await agentFetch<{ ramal: Ramal }>(`/ramais/${endpoint_id}`, {
      method: "PUT",
      tenantId,
      body: patch,
    });
    await writeAuditLog(context.token, {
      tenant_id: tenantId,
      action: "ramal.update",
      payload: { endpoint_id, patch },
    });
    return res;
  });

export const deleteRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ endpoint_id: z.string(), tenant_id: z.number().int().positive().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await agentFetch(`/ramais/${data.endpoint_id}`, { method: "DELETE", tenantId });
    await writeAuditLog(context.token, {
      tenant_id: tenantId,
      action: "ramal.delete",
      payload: { id: data.endpoint_id },
    });
    return { ok: true };
  });

export const pingAgent = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { agentFetch, isAgentConfigured } = await import("./agent.server");
    if (!isAgentConfigured())
      return { ok: false, configured: false, error: "Agente não configurado" };
    try {
      const data = await agentFetch<{ status: string; version?: string }>("/health", {
        timeoutMs: 5_000,
      });
      return { ok: true, configured: true, data };
    } catch (e) {
      return { ok: false, configured: true, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const getMyTenant = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { agentFetch } = await import("./agent.server");
    const res = await agentFetch<{
      tenants: { tenant_id: number; label: string | null; is_default: boolean }[];
    }>("/my/tenants", { bearerToken: context.token });
    return { tenants: res.tenants ?? [] };
  });

export const getRamalMonitorTicket = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { tenant_id: string }) => data)
  .handler(async ({ data, context }) => {
    const tenantId = data.tenant_id;
    return await authenticatedAgentFetch<{ ticket: string }>(context, "/ws/ramais/token", {
      method: "GET",
      tenantId,
    });
  });

export const generateRamalPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ tenant_id: z.number().int().positive().optional(), endpoint_id: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{ ok: true; senha: string }>(
      context,
      "/ramais/generate-password",
      {
        method: "POST",
        tenantId,
        body: { endpoint_id: data.endpoint_id },
      },
    );
  });

// ---------- Tenant upsert (mariadb) ----------
export const upsertTenantPabx = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), nome: z.string().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { agentFetch } = await import("./agent.server");
    await agentFetch("/tenants", { method: "POST", body: data });
    return { ok: true };
  });

// ---------- CDR fetchers ----------
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
  const { agentFetch } = await import("./agent.server");
  const tenantId = await resolveTenantId(token, filters.tenant_id);
  const qs = buildQuery(filters, tenantId);
  const res = await agentFetch<{
    rows: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`${path}${qs}`, { tenantId });
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

// ---------- Status em lote (online/offline) ----------
export const listRamaisStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await agentFetch<{ endpoints: Record<string, string> }>(`/ramais/status`, {
      tenantId,
      bearerToken: context.token,
    });
    return { endpoints: res.endpoints ?? {} };
  });

// ---------- Download das gravações ----------

export const downloadGravacao = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        linkedid: z.string(),
        tipo: z.enum(["ramal", "fila"]),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentDownload } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);

    // 1. Faz a requisição para o agente Asterisk
    const res = await agentDownload(`/gravacoes/${data.tipo}/${data.linkedid}`, {
      tenantId,
    });

    // 2. Em vez de retornar o 'res' puro (que causa o erro "immutable"),
    // pegamos o ArrayBuffer (binário) do áudio diretamente no servidor.
    const audioBuffer = await res.arrayBuffer();

    // Captura o cabeçalho de disposição que veio do Asterisk (contendo o nome real do arquivo)
    const contentDisposition =
      res.headers.get("content-disposition") || `attachment; filename="call-${data.linkedid}.wav"`;

    // 3. Retornamos um novo Response customizado com o buffer e o cabeçalho correto
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": contentDisposition,
      },
    });
  });
