import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface Fila {
  name: string;
  display_name: string;
  description: string | null;
  ativo: boolean;
  strategy: string | null;
  ringinuse: "yes" | "no" | null;
  timeout: number | null;
  maxlen: number | null;
  musiconhold: string | null;
  membros: number;
  pesquisa: boolean;
  pesquisa_id: number | null;
}

export interface FilaAgente {
  id: string;
  interface: string;
  penalty: number | null;
  membername: string | null;
  ramal: string | null;
}

export interface FilaQueueConfig {
  tenant_id: number;
  name: string;
  musiconhold: string | null;
  strategy: string | null;
  timeout: number | null;
  ringinuse: "yes" | "no" | null;
  maxlen: number | null;
}

const FilaInput = z.object({
  tenant_id: z.number().int().positive().optional(),
  display_name: z.coerce.string().trim().min(1).max(120),
  description: z.coerce.string().trim().max(255).optional().or(z.literal("")),
  strategy: z
    .enum(["ringall", "rrmemory", "leastrecent", "fewestcalls", "random"])
    .default("ringall"),
  ringinuse: z.enum(["no", "yes"]),
  timeout: z.coerce.number().int().min(0).max(3600).default(15),
  fila_timeout: z.coerce.number().int().min(0).max(3600).default(0),
  retry: z.coerce.number().int().min(0).max(3600).default(5),
  gravacao: z.boolean().default(false),
  ativo: z.boolean().default(true),
  pesquisa: z.boolean().default(false),
  pesquisa_id: z.number().int().positive().optional(),
});
const FilaUpdate = FilaInput.partial().extend({
  name: z.string().min(1),
  tenant_id: z.number().int().positive().optional(),
});
const ToggleFilaAtivoInput = z.object({
  name: z.string().trim().min(1),
  tenant_id: z.number().int().positive().optional(),
  ativo: z.boolean(),
});

const TenantOnly = z
  .object({ tenant_id: z.number().int().positive().optional() })
  .optional()
  .transform((v) => v ?? {});

export const listFilas = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => TenantOnly.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ filas: Fila[] }>(
      context,
      `/filas?tenant=${tenantId}`,
      { tenantId },
    );
    return { tenantId, filas: res.filas ?? [] };
  });

export const createFila = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => FilaInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; name: string }>(context, "/filas", {
      method: "POST",
      tenantId,
      body,
    });
  });

export const updateFila = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => FilaUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { name, tenant_id: _i, ...body } = data;
    return await authenticatedAgentFetch<{ ok: true }>(context, `/filas/${name}`, {
      method: "PUT",
      tenantId,
      body,
    });
  });

export const deleteFila = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ name: z.string().min(1), tenant_id: z.number().int().positive().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/filas/${data.name}`, { method: "DELETE", tenantId });
    return { ok: true };
  });

export const toggleFilaAtivo = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => ToggleFilaAtivoInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/filas/${data.name}/ativo`, {
      method: "PUT",
      tenantId,
      body: { ativo: data.ativo },
    });
    return { ok: true };
  });

export const getFilaAgentes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        name: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{
      fila: Fila;
      agentes: FilaAgente[];
      queue: FilaQueueConfig | null;
    }>(context, `/filas/${data.name}/agentes`, { tenantId });
    return res;
  });

export const addFilaAgente = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        name: z.string().min(1),
        ramal: z.string().min(1),
        penalty: z.coerce.number().int().min(0).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{ ok: true; name: string }>(
      context,
      `/filas/${data.name}/agentes`,
      {
        method: "POST",
        tenantId,
        body: { ramal: data.ramal, penalty: data.penalty },
      },
    );
  });

export const removeFilaAgente = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        agente_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/filas/agentes/${data.agente_id}`, {
      method: "DELETE",
      tenantId,
    });
    return { ok: true };
  });

export const setFilaAgentePenalty = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        agente_id: z.string().min(1),
        penalty: z.coerce.number().int().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(context, `/filas/agentes/${data.agente_id}`, {
      method: "PUT",
      tenantId,
      body: { penalty: data.penalty },
    });
    return { ok: true };
  });
