import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export type AcaoHorario = "RAMAL" | "FILA" | "URA" | "EXTERNO" | "INTERNO" | "AUDIO";
export interface RegraHorario {
  regra_identifier: string;
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
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ regras: RegraHorario[] }>(
      context,
      "/regra-horario",
      { tenantId },
    );
    return { regras: res.regras ?? [] };
  });

export const createRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => RegraHorarioInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; regra_identifier: string }>(
      context,
      "/regra-horario",
      {
        method: "POST",
        tenantId,
        body,
      },
    );
  });

export const updateRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    RegraHorarioInput.extend({ regra_identifier: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { regra_identifier, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(
      context,
      `/regra-horario/${regra_identifier}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteRegraHorario = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        regra_identifier: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/regra-horario/${data.regra_identifier}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });
