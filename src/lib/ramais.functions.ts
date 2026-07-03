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
  tipo: string | null;
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

// ---------- CDR fetchers (inlined per endpoint — evita perder o contexto
// do middleware quando o server-fn plugin do TanStack processa factories) ----------
async function fetchCdr(path: string, ctxSupabase: SupabaseClient, userId: string, tenantIdInput?: number) {
  const { agentFetch } = await import("./agent.server");
  const tenantId = await resolveScopedTenant(ctxSupabase, userId, tenantIdInput);
  const res = await agentFetch<{ rows: any[] }>(`${path}?tenant=${tenantId}`, { tenantId });
  return { tenantId, rows: res.rows ?? [] };
}

export const listCdrEntrada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/entrada", context.supabase, context.userId, data.tenant_id));

export const listCdrRamal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ramal", context.supabase, context.userId, data.tenant_id));

export const listCdrFila = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/fila", context.supabase, context.userId, data.tenant_id));

export const listCdrUra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/ura", context.supabase, context.userId, data.tenant_id));

export const listCdrPesquisa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/pesquisa", context.supabase, context.userId, data.tenant_id));

export const listCdrCidadesEntrada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/entrada", context.supabase, context.userId, data.tenant_id));

export const listCdrCidadesSaida = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(({ data, context }) => fetchCdr("/cdr/cidades/saida", context.supabase, context.userId, data.tenant_id));


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
