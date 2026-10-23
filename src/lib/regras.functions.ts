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

export interface Regra {
  id: number;
  tronco_identifier: string;
  tronco_nome: string;
  regra_nome: string;
  tipo: "STFC" | "E164";
  tipo_ligacao: "movel" | "fixo" | "ddi" | "cng" | "esp";
  codigo_csp: string | null;
  expressao: string;
  expressao_transformada: string;
  prioridade: number;
}

const RegraInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  tronco_identifier: z.string().min(1),
  tronco_nome: z.string().min(1),
  regra_nome: z.string().min(1),
  tipo: z.enum(["STFC", "E164"]),
  tipo_ligacao: z.enum(["movel", "fixo", "ddi", "cng", "esp"]),
  codigo_csp: z.string().optional(),
  expressao: z.string().min(1),
  expressao_transformada: z.string().min(1),
  prioridade: z.number(),
});

export const listRegras = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ regras: Regras[] }>(context, "/regras", {
      tenantId,
    });
    return { regras: res.regras ?? [] };
  });

export const createRegras = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => RegraInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; regras: Regras[] }>(context, "/regras", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const createRegrasPredefinidas = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        tronco_identifier: z.string().min(1),
        tipo: z.enum(["STFC", "E164"]),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; regras: Regras[] }>(
      context,
      "/regras/predefinidas",
      {
        method: "POST",
        tenantId,
        body,
      },
    );
  });

export const updateRegras = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => RegraInput.partial().extend({ id: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/regras/${data.id}`, {
      method: "PUT",
      tenantId,
      body,
    });
  });

export const deleteRegras = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ id: z.number().positive(), tenant_id: z.number().int().positive().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/regras/${data.id}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });

export const deleteRegrasLote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        regras_ids: z.array(z.number().int().min(1)).min(1),
        tenant_id: z.number().int().positive().optional(),
        tronco_identifier: z.string().min(1),
        tipo: z.enum(["STFC", "E164"]),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const deleted = await authenticatedAgentFetch(context, "/regras/lote", {
      method: "DELETE",
      tenantId,
      body: {
        regras_ids: data.regras_ids,
        tronco_identifier: data.tronco_identifier,
        tipo: data.tipo,
      },
    });

    await writeAuditLog(context.token, {
      tenant_id: tenantId,
      action: "regras.delete_lote",
      payload: {
        regras_ids: data.regras_ids,
        tronco_identifier: data.tronco_identifier,
        tipo: data.tipo,
      },
    });

    return deleted;
  });
