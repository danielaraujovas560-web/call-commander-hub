import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface RoteamentoItem {
  numero: string;
  tipo_destino: string;
  destino: string;
  descricao: string | null;
}

export const listRoteamento = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ roteamento: RoteamentoItem[] }>(
      context,
      "/roteamento",
      { tenantId },
    );
    return { roteamento: res.roteamento ?? [] };
  });

const RoteamentoInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  numero: z.string().min(1),
  tipo_destino: z.enum(["RAMAL", "FILA", "URA", "EXTERNO", "REGRA_HORARIO", "AUDIO"]),
  destino: z.coerce.string().trim().min(1).max(50),
  descricao: z.string().trim().max(100).optional(),
});

export const createRoteamento = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => RoteamentoInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; numero: string }>(context, "/roteamento", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const updateRoteamento = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    RoteamentoInput.partial()
      .extend({ numero: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { numero, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/roteamento/${numero}`, {
      method: "PUT",
      tenantId,
      body,
    });
  });

export const deleteRoteamento = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ numero: z.string().min(1), tenant_id: z.number().int().positive().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/roteamento/${data.numero}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });
