import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface HorarioRamal {
  regra: string;
  nome: string;
  dias: string;
  hora_inicial: string;
  hora_final: string;
  membros: number;
}
export interface HorarioRamalMembro {
  regra: string;
  ramal: string;
  nome: string | null;
}

const HorarioRamalInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(100),
  dias: z.coerce.string().trim().min(1).max(100),
  hora_inicial: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  hora_final: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  ramais: z.array(z.coerce.string().min(1)).default([]),
});

const UpdateHorarioRamalInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  regra: z.string().min(1),
  nome: z.coerce.string().trim().min(1).max(100),
  dias: z.coerce.string().trim().min(1).max(100),
  hora_inicial: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  hora_final: z.coerce.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

const MembrosHorarioRamal = z.object({
  tenant_id: z.number().int().positive().optional(),
  ramais: z.array(z.coerce.string().min(1)).default([]),
});

export const listHorarioRamais = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ regras: HorarioRamal[] }>(
      context,
      "/horario-ramais",
      { tenantId },
    );
    return { regras: res.regras ?? [] };
  });

export const getHorarioRamalMembros = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ regra: z.string().min(1), tenant_id: z.number().int().positive().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ membros: HorarioRamalMembro[] }>(
      context,
      `/horario-ramais/${data.regra}/membros`,
      { tenantId },
    );
    return { membros: res.membros ?? [] };
  });

export const createHorarioRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => HorarioRamalInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; regra: string }>(context, "/horario-ramais", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const updateHorarioRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => UpdateHorarioRamalInput.extend({ regra: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { regra, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/horario-ramais/${regra}`, {
      method: "PUT",
      tenantId,
      body,
    });
  });

export const updateHorarioRamalMembros = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => MembrosHorarioRamal.extend({ regra: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { regra, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(
      context,
      `/horario-ramais/${regra}/membros`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteHorarioRamal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ regra: z.string().min(1), tenant_id: z.number().int().positive().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/horario-ramais/${data.regra}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });
