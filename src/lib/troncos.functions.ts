import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface Tronco {
  tronco_pjsip: string;
  nome: string;
  status: number | null;
  techprefix: string | null;
  tipo: "STFC" | "E164" | string | null;
  registrar?: string | null;
  login?: string | null;
  senha?: string | null;
  ip?: string | null;
  porta?: string | null;
}

export const listTroncos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ troncos: Tronco[] }>(
      context,
      `/troncos?tenant=${tenantId}`,
      {
        tenantId,
      },
    );
    return { troncos: res.troncos ?? [] };
  });

const TroncoInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(50),
  ip: z.coerce.string().trim().min(1).max(100),
  porta: z.coerce.string().trim().max(7).optional().or(z.literal("")),
  tipo: z.enum(["STFC", "E164"]),
  techprefix: z.coerce
    .string()
    .trim()
    .regex(/^\d*$/, "Só números")
    .max(20)
    .optional()
    .or(z.literal("")),
  registrar: z.enum(["sim", "não"]).default("não"),
  login: z.coerce.string().trim().max(100).optional().or(z.literal("")),
  senha: z.coerce.string().trim().max(100).optional().or(z.literal("")),
});
const TroncoUpdate = TroncoInput.partial().extend({
  tronco_pjsip: z.coerce.string().trim().min(1),
});

export const createTronco = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => TroncoInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; tronco_pjsip: string }>(context, "/troncos", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const updateTronco = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => TroncoUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tronco_pjsip, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/troncos/${tronco_pjsip}`, {
      method: "PUT",
      tenantId,
      body,
    });
  });

export const deleteTronco = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tronco_pjsip: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/troncos/${data.tronco_pjsip}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });

export const getTroncoStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tronco_pjsip: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{ endpoint: string; state?: string; status: string }>(
      context,
      `/troncos/${data.tronco_pjsip}/status`,
      { tenantId },
    );
  });

export const listTroncosStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ endpoints: Record<string, string> }>(
      context,
      `/troncos/status`,
      {
        tenantId,
      },
    );
    return { endpoints: res.endpoints ?? {} };
  });
