import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Ramal {
  id: number;
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
}

export interface Tronco {
  id: number;
  nome: string;
  tronco_pjsip: string;
  status: number | null;
  techprefix: string | null;
  tipo: "STFC" | "E164" | string | null;
  registrar?: string | null;
  login?: string | null;
  senha?: string | null;
  ip?: string | null;
  porta?: string | null;
}

export interface BlacklistItem {
  id: number;
  regra: "Entrada" | "Saida";
  tipo: "Prefixo" | "Numero";
  destino: string;
  ativo: boolean;
  motivo: string | null;
  data_hora_desbloqueio: string;
}

const RamalInput = z.object({
  nome: z.coerce.string().trim().max(80).optional().or(z.literal("")),
  ramal: z.coerce.string().trim().regex(/^\d{3,6}$/, "Ramal deve ter 3-6 dígitos"),
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
  tenant_id: z.number().int().positive().optional(),
});

const TenantOnly = z
  .object({ tenant_id: z.number().int().positive().optional() })
  .optional()
  .transform((v) => v ?? {});

async function resolveScopedTenant(
  supabase: SupabaseClient,
  userId: string,
  override?: number,
): Promise<number> {
  if (override == null) {
    const { resolveTenantId } = await import("./tenant.server");
    return resolveTenantId(supabase, userId);
  }
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) return override;
  const { data } = await supabase
    .from("tenants_link")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("tenant_id", override)
    .maybeSingle();
  if (!data) {
    // Tentar: o cliente está vinculado via tabela clientes (RLS permite ver)
    const { data: c } = await supabase
      .from("clientes")
      .select("tenant_id")
      .eq("tenant_id", override)
      .maybeSingle();
    if (!c) throw new Error("Sem permissão para este tenant.");
  }
  return override;
}

export const listRamais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ ramais: Ramal[] }>(`/ramais?tenant=${tenantId}`, { tenantId });
    return { tenantId, ramais: res.ramais ?? [] };
  });

export const listTroncos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ troncos: Tronco[] }>(`/troncos?tenant=${tenantId}`, { tenantId });
    return { troncos: res.troncos ?? [] };
  });

export const createRamal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RamalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _ignore, ...payload } = data;

    const created = await agentFetch<{ ramal: Ramal }>("/ramais", {
      method: "POST",
      tenantId,
      body: payload,
    });

    try {
      await context.supabase.from("audit_log").insert({
        user_id: context.userId,
        tenant_id: tenantId,
        action: "ramal.create",
        payload: { ramal: data.ramal, nome: data.nome },
      });
    } catch (e) {
      console.warn("[createRamal] audit_log insert falhou:", e);
    }

    return created;
  });


const RamalUpdateInput = z.object({
  id: z.number().int().positive(),
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
  transbordo: z.boolean().optional(),
  transbordo_tronco: z.coerce.string().max(400).optional().or(z.literal("")).or(z.null()),
});

export const updateRamal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RamalUpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _t, ...patch } = data;
    const res = await agentFetch<{ ramal: Ramal }>(`/ramais/${id}`, {
      method: "PUT",
      tenantId,
      body: patch,
    });
    try {
      await context.supabase.from("audit_log").insert({
        user_id: context.userId,
        tenant_id: tenantId,
        action: "ramal.update",
        payload: { id, patch },
      });
    } catch (e) {
      console.warn("[updateRamal] audit_log insert falhou:", e);
    }
    return res;
  });

export const deleteRamal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/ramais/${data.id}`, { method: "DELETE", tenantId });
    try {
      await context.supabase.from("audit_log").insert({
        user_id: context.userId,
        tenant_id: tenantId,
        action: "ramal.delete",
        payload: { id: data.id },
      });
    } catch (e) {
      console.warn("[deleteRamal] audit_log insert falhou:", e);
    }

    return { ok: true };
  });

export const pingAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { agentFetch, isAgentConfigured } = await import("./agent.server");
    if (!isAgentConfigured()) return { ok: false, configured: false, error: "Agente não configurado" };
    try {
      const data = await agentFetch<{ status: string; version?: string }>("/health", { timeoutMs: 5_000 });
      return { ok: true, configured: true, data };
    } catch (e) {
      return { ok: false, configured: true, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const getMyTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("tenants_link")
      .select("tenant_id, label, is_default")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .limit(10);
    return { tenants: data ?? [] };
  });

// ---------- Tenant upsert (mariadb) ----------
export const upsertTenantPabx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
  })
  .optional()
  .transform((v) => v ?? {});
type CdrFilterT = z.infer<typeof CdrFilter>;

function buildQuery(filters: CdrFilterT): string {
  const q = new URLSearchParams();
  for (const k of ["linkedid", "origem", "destino", "status", "from", "to"] as const) {
    const v = filters[k];
    if (v && v.trim() !== "") q.set(k, v.trim());
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function fetchCdr(path: string, ctxSupabase: SupabaseClient, userId: string, filters: CdrFilterT) {
  const { agentFetch } = await import("./agent.server");
  const tenantId = await resolveScopedTenant(ctxSupabase, userId, filters.tenant_id);
  const qs = buildQuery(filters);
  const sep = qs ? "&" : "?";
  const res = await agentFetch<{ rows: any[] }>(`${path}${qs}${sep}tenant=${tenantId}`, { tenantId });
  return { tenantId, rows: res.rows ?? [] };
}

export const listCdrEntrada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/entrada", context.supabase, context.userId, data));

export const listCdrRamal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ramal", context.supabase, context.userId, data));

export const listCdrFila = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/fila", context.supabase, context.userId, data));

export const listCdrUra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ura", context.supabase, context.userId, data));

export const listCdrPesquisa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/pesquisa", context.supabase, context.userId, data));

export const listCdrCidadesEntrada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/entrada", context.supabase, context.userId, data));

export const listCdrCidadesSaida = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CdrFilter.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/saida", context.supabase, context.userId, data));


// ---------- Blacklist ----------
export const listBlacklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ blacklist: BlacklistItem[] }>(`/blacklist?tenant=${tenantId}`, { tenantId });
    return { tenantId, blacklist: res.blacklist ?? [] };
  });

export const createBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        regra: z.enum(["Entrada", "Saida"]),
        tipo: z.enum(["Prefixo", "Numero"]),
        destino: z.string().min(1).max(64),
        motivo: z.string().max(100).optional(),
        data_hora_desbloqueio: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    await agentFetch("/blacklist", { method: "POST", tenantId, body });
    return { ok: true };
  });

export const deleteBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/blacklist/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

// ---------- Filas (gestão) ----------
export interface Fila {
  id: number;
  virtual_extension: string;
  name: string;
  display_name: string;
  description: string | null;
  active: boolean;
  strategy: string | null;
  timeout: number | null;
  maxlen: number | null;
  musiconhold: string | null;
  membros: number;
}

export const listFilas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ filas: Fila[] }>(`/filas?tenant=${tenantId}`, { tenantId });
    return { tenantId, filas: res.filas ?? [] };
  });

export const getFilaMembros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.number().int().positive().optional(),
      virtual_extension: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{
      fila: any; agentes: any[]; queue: any; queue_members: any[];
    }>(`/filas/${encodeURIComponent(data.virtual_extension)}/membros`, { tenantId });
    return res;
  });

// ---------- URAs (gestão) ----------
export interface Ura {
  id: number;
  nome: string;
  audio: string;
  max_digits: number | null;
  tentativas: number | null;
  timeout: number | null;
  ativo: boolean;
  opcoes: { id: number; digito: string; tipo_destino: string; destino: string }[];
}

export const listUras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ uras: Ura[] }>(`/uras?tenant=${tenantId}`, { tenantId });
    return { tenantId, uras: res.uras ?? [] };
  });

export const listUraAudios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ audios: string[]; dir: string; warn?: string }>(
      `/uras/audios`, { tenantId },
    );
    return { audios: res.audios ?? [], dir: res.dir, warn: res.warn };
  });

export const listUraDestinos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    return await agentFetch<{
      filas: { value: string; label: string }[];
      uras: { value: number; label: string }[];
      ramais: { value: string; label: string }[];
      troncos: { value: string; label: string }[];
      regras: { value: number; label: string }[];
      audios: string[];
    }>(`/uras/destinos`, { tenantId });
  });

const UraInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(80),
  audio: z.coerce.string().trim().min(1).max(120),
  max_digits: z.coerce.number().int().min(1).max(20),
  tentativas: z.coerce.number().int().min(1).max(10),
  timeout: z.coerce.number().int().min(1).max(120),
  ativo: z.boolean().default(true),
});

export const createUra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UraInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>("/uras", {
      method: "POST", tenantId, body,
    });
  });

const UraUpdateInput = z.object({
  id: z.number().int().positive(),
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(80).optional(),
  audio: z.coerce.string().trim().min(1).max(120).optional(),
  max_digits: z.coerce.number().int().min(1).max(20).optional(),
  tentativas: z.coerce.number().int().min(1).max(10).optional(),
  timeout: z.coerce.number().int().min(1).max(120).optional(),
  ativo: z.boolean().optional(),
});

export const updateUra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UraUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...patch } = data;
    return await agentFetch<{ ok: true }>(`/uras/${id}`, {
      method: "PUT", tenantId, body: patch,
    });
  });

export const deleteUra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/uras/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

export const addUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ura_id: z.number().int().positive(),
      tenant_id: z.number().int().positive().optional(),
      digito: z.coerce.string().max(4),
      tipo_destino: z.enum(["FILA", "URA", "RAMAL", "INTERNO", "EXTERNO", "AUDIO"]),
      destino: z.coerce.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { ura_id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>(`/uras/${ura_id}/opcoes`, {
      method: "POST", tenantId, body,
    });
  });

export const updateUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.number().int().positive(),
      tenant_id: z.number().int().positive().optional(),
      digito: z.coerce.string().max(4).optional(),
      tipo_destino: z.enum(["FILA", "URA", "RAMAL", "INTERNO", "EXTERNO", "AUDIO"]).optional(),
      destino: z.coerce.string().min(1).max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/uras/opcoes/${id}`, {
      method: "PUT", tenantId, body,
    });
  });

export const deleteUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/uras/opcoes/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });


// ---------- Troncos CRUD ----------
const TroncoInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(50),
  ip: z.coerce.string().trim().min(1).max(100),
  porta: z.coerce.string().trim().max(7).optional().or(z.literal("")),
  tipo: z.enum(["STFC", "E164"]),
  techprefix: z.coerce.string().trim().regex(/^\d*$/, "Só números").max(20).optional().or(z.literal("")),
  registrar: z.enum(["sim", "não"]).default("não"),
  login: z.coerce.string().trim().max(100).optional().or(z.literal("")),
  senha: z.coerce.string().trim().max(100).optional().or(z.literal("")),
});
const TroncoUpdate = TroncoInput.partial().extend({
  id: z.number().int().positive(),
  tenant_id: z.number().int().positive().optional(),
});

export const createTronco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TroncoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>("/troncos", { method: "POST", tenantId, body });
  });

export const updateTronco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TroncoUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/troncos/${id}`, { method: "PUT", tenantId, body });
  });

export const deleteTronco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/troncos/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

export const getTroncoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    return await agentFetch<{ endpoint: string; state?: string; status: string }>(`/troncos/${data.id}/status`, { tenantId });
  });

// ---------- Filas CRUD ----------
const FilaInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  virtual_extension: z.coerce.string().trim().regex(/^\d{2,10}$/, "Ramal virtual deve ser numérico"),
  display_name: z.coerce.string().trim().min(1).max(120),
  description: z.coerce.string().trim().max(255).optional().or(z.literal("")),
  strategy: z.enum(["ringall", "linear", "random", "rrordered"]).default("ringall"),
  timeout: z.coerce.number().int().min(0).max(3600).default(15),
  active: z.boolean().default(true),
  ramais: z.array(z.object({
    nome_ramal: z.string().min(1),
    prioridade: z.coerce.number().int().min(1).max(100).default(1),
  })).default([]),
});
const FilaUpdate = FilaInput.partial().extend({
  id: z.number().int().positive(),
  tenant_id: z.number().int().positive().optional(),
});

export const createFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; name: string }>("/filas", { method: "POST", tenantId, body });
  });

export const updateFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilaUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/filas/${id}`, { method: "PUT", tenantId, body });
  });

export const deleteFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/filas/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

// ---------- Numeros CRUD ----------
export interface NumeroItem { id: number; numero: string; descricao: string | null }

export const listNumeros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ numeros: NumeroItem[] }>("/numeros", { tenantId });
    return { numeros: res.numeros ?? [] };
  });

const NumeroInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  numero: z.coerce.string().trim().min(1).max(20),
  descricao: z.coerce.string().trim().max(255).optional().or(z.literal("")),
});

export const createNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NumeroInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>("/numeros", { method: "POST", tenantId, body });
  });

export const updateNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NumeroInput.partial().extend({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/numeros/${id}`, { method: "PUT", tenantId, body });
  });

export const deleteNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/numeros/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

// ---------- Roteamento ----------
export interface RoteamentoItem {
  id: number; numero_id: number; tipo_destino: string; destino: string;
  numero: string; descricao: string | null;
}

export const listRoteamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ roteamento: RoteamentoItem[] }>("/roteamento", { tenantId });
    return { roteamento: res.roteamento ?? [] };
  });

const RoteamentoInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  numero_id: z.coerce.number().int().positive(),
  tipo_destino: z.enum(["RAMAL", "FILA", "URA", "EXTERNO", "HORARIO_ATENDIMENTO", "AUDIO"]),
  destino: z.coerce.string().trim().min(1).max(50),
});

export const createRoteamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoteamentoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>("/roteamento", { method: "POST", tenantId, body });
  });

export const updateRoteamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoteamentoInput.partial().extend({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/roteamento/${id}`, { method: "PUT", tenantId, body });
  });

export const deleteRoteamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/roteamento/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

// ---------- Regra Horário (horário de atendimento personalizado) ----------
export type AcaoHorario = "RAMAL" | "FILA" | "URA" | "EXTERNO" | "INTERNO" | "AUDIO";
export interface RegraHorario {
  id: number;
  nome: string;
  dias: string;
  hora_inicial: string;
  hora_final: string;
  acao_dentro: AcaoHorario;
  destino_dentro: string;
  acao_fora: AcaoHorario;
  destino_fora: string;
}

const ACAO = z.enum(["RAMAL", "FILA", "URA", "EXTERNO", "INTERNO", "AUDIO"]);
const RegraHorarioInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(100),
  dias: z.coerce.string().trim().min(1).max(100),
  hora_inicial: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  hora_final: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  acao_dentro: ACAO,
  destino_dentro: z.coerce.string().trim().min(1).max(100),
  acao_fora: ACAO,
  destino_fora: z.coerce.string().trim().min(1).max(100),
});

export const listRegraHorario = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const res = await agentFetch<{ regras: RegraHorario[] }>("/regra-horario", { tenantId });
    return { regras: res.regras ?? [] };
  });

export const createRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegraHorarioInput.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true; id: number }>("/regra-horario", { method: "POST", tenantId, body });
  });

export const updateRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegraHorarioInput.extend({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    const { id, tenant_id: _i, ...body } = data;
    return await agentFetch<{ ok: true }>(`/regra-horario/${id}`, { method: "PUT", tenantId, body });
  });

export const deleteRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), tenant_id: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveScopedTenant(context.supabase, context.userId, data.tenant_id);
    await agentFetch(`/regra-horario/${data.id}`, { method: "DELETE", tenantId });
    return { ok: true };
  });
