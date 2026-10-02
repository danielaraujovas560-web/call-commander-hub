import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface Ura {
  ura_identifier: string;
  nome: string;
  audio: string;
  max_digits: number | null;
  tentativas: number | null;
  timeout: number | null;
  ativo: boolean;
  opcoes: { ura_identifier: string; digito: string; tipo_destino: string; destino: string }[];
}

const UraInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  nome: z.coerce.string().trim().min(1).max(80),
  audio: z.coerce.string().trim().min(1).max(120),
  max_digits: z.coerce.number().int().min(1).max(20),
  tentativas: z.coerce.number().int().min(1).max(10),
  timeout: z.coerce.number().int().min(1).max(120),
  ativo: z.boolean().default(true),
});

export const listUras = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ uras: Ura[] }>(
      context,
      `/uras?tenant=${tenantId}`,
      { tenantId },
    );
    return { tenantId, uras: res.uras ?? [] };
  });

export const listUraDestinos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{
      filas: { value: string; label: string }[];
      uras: { value: number; label: string }[];
      ramais: { value: string; label: string }[];
      troncos: { value: string; label: string }[];
      regras: { value: number; label: string }[];
      audios: { value: string; label: string }[];
    }>(context, `/uras/destinos`, { tenantId });
  });

export const createUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => UraInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; ura_identifier: string }>(context, "/uras", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const updateUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    UraInput.partial()
      .extend({ ura_identifier: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { ura_identifier, tenant_id: _i, ...patch } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/uras/${ura_identifier}`, {
      method: "PUT",
      tenantId,
      body: patch,
    });
  });

export const deleteUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/uras/${data.ura_identifier}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });

export const addUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
        digito: z.coerce.string().max(4),
        tipo_destino: z.enum(["FILA", "URA", "RAMAL", "INTERNO", "EXTERNO", "AUDIO"]),
        destino: z.coerce.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { ura_identifier, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; ura_identifier: string }>(
      context,
      `/uras/${ura_identifier}/opcoes`,
      {
        method: "POST",
        tenantId,
        body,
      },
    );
  });

export const updateUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),
        tenant_id: z.number().int().positive().optional(),
        digito_atual: z.coerce.string().max(4),
        digito: z.coerce.string().max(4).optional(),
        tipo_destino: z.enum(["FILA", "URA", "RAMAL", "INTERNO", "EXTERNO", "AUDIO"]).optional(),
        destino: z.coerce.string().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { ura_identifier, digito_atual, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(
      context,
      `/uras/${ura_identifier}/opcoes/${encodeURIComponent(digito_atual)}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),
        digito: z.coerce.string().max(4),
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(
      context,
      `/uras/${data.ura_identifier}/opcoes/${encodeURIComponent(data.digito)}`,
      {
        method: "DELETE",
        tenantId,
      },
    );
    return { ok: true };
  });

export const toggleUraAtivo = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1).max(64),
        tenant_id: z.number().int().positive().optional(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/uras/${data.ura_identifier}/ativo`, {
      method: "PUT",
      tenantId,
      body: { ativo: data.ativo },
    });
    return { ok: true };
  });
