import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
}

export interface Tronco {
  endpoint_id: string;
  username: string | null;
  host: string | null;
  context: string | null;
  label: string | null;
}

const RamalInput = z.object({
  nome: z.string().trim().min(1).max(80),
  ramal: z.string().trim().regex(/^\d{3,6}$/, "Ramal deve ter 3-6 dígitos"),
  senha: z.string().min(6).max(64),
  tronco: z.string().trim().min(1).max(80),
  ddd: z.string().regex(/^\d{2}$/, "DDD com 2 dígitos"),
  callerid: z.string().regex(/^\d{10,13}$/).optional().or(z.literal("")),
  fixo: z.boolean().default(true),
  movel: z.boolean().default(true),
  ddi: z.boolean().default(false),
  especial: z.boolean().default(false),
  cng: z.boolean().default(false),
});

export const listRamais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveTenantId } = await import("./tenant.server");
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.supabase, context.userId);
    const data = await agentFetch<{ ramais: Ramal[] }>(
      `/ramais?tenant=${tenantId}`,
      { tenantId },
    );
    return { tenantId, ramais: data.ramais ?? [] };
  });

export const listTroncos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveTenantId } = await import("./tenant.server");
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.supabase, context.userId);
    const data = await agentFetch<{ troncos: Tronco[] }>(
      `/troncos?tenant=${tenantId}`,
      { tenantId },
    );
    return { troncos: data.troncos ?? [] };
  });

export const createRamal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RamalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveTenantId } = await import("./tenant.server");
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.supabase, context.userId);

    const created = await agentFetch<{ ramal: Ramal }>("/ramais", {
      method: "POST",
      tenantId,
      body: data,
    });

    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      tenant_id: tenantId,
      action: "ramal.create",
      payload: { ramal: data.ramal, nome: data.nome },
    });

    return created;
  });

export const deleteRamal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { resolveTenantId } = await import("./tenant.server");
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.supabase, context.userId);

    await agentFetch(`/ramais/${data.id}`, { method: "DELETE", tenantId });
    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      tenant_id: tenantId,
      action: "ramal.delete",
      payload: { id: data.id },
    });
    return { ok: true };
  });

export const pingAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { agentFetch, isAgentConfigured } = await import("./agent.server");
    if (!isAgentConfigured()) {
      return { ok: false, configured: false, error: "Agente não configurado" };
    }
    try {
      const data = await agentFetch<{ status: string; version?: string }>(
        "/health",
        { timeoutMs: 5_000 },
      );
      return { ok: true, configured: true, data };
    } catch (e) {
      return {
        ok: false,
        configured: true,
        error: e instanceof Error ? e.message : String(e),
      };
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
