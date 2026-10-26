import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface IntegracoesItem {
  id: number;
  provider: "meta";
  remetente: string;
  waba_id: string | null;
  template_nome: string;
  template_idioma: string;
  nome_empresa: string;
  ativo: boolean;
  credencial_configurada: boolean;
  dids: string[];
  total_dids: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<{
    type: string;
    format: string | null;
    text: string | null;
    buttons: Array<{
      type: string;
      text: string | null;
    }>;
  }>;
}

export interface TemplateIntegracaoResponse {
  template: TemplateMeta;
  integracao: {
    id: number;
    nome_empresa: string;
  };
}

export const getIntegracaoTemplate = createServerFn({
  method: "GET",
})
  .middleware([requireAuth])
  .validator((data: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        id: z.number().int().positive(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);

    return authenticatedAgentFetch<TemplateIntegracaoResponse>(
      context,
      `/integracoes/${data.id}/template`,
      { tenantId },
    );
  });

const tenantSchema = z.object({ tenant_id: z.number().int().positive().optional() });
const idSchema = tenantSchema.extend({ id: z.number().int().positive() });
const fields = z.object({
  provider: z.literal("meta"),
  remetente: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, "Phone Number ID deve conter apenas números"),
  waba_id: z.string().regex(/^\d{5,32}$/),
  template_nome: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{1,255}$/),
  template_idioma: z
    .string()
    .trim()
    .regex(/^[a-z]{2}_[A-Z]{2}$/),
  nome_empresa: z.string().trim().min(1).max(150),
  ativo: z.boolean(),
});
const createSchema = tenantSchema.merge(
  fields.extend({ access_token: z.string().trim().min(1).max(4096) }),
);
const updateSchema = idSchema.merge(
  fields.extend({ access_token: z.string().trim().max(4096).optional() }),
);

export const listIntegracoes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => tenantSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ integracoes: IntegracoesItem[] }>(
      context,
      "/integracoes",
      { tenantId },
    );
    return { integracoes: res.integracoes ?? [] };
  });

// Ajuste os campos method/body do authenticatedAgentFetch se o helper do seu projeto
// usar outra assinatura. As operações e o isolamento por tenant continuam iguais.
export const createIntegracao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _ignored, ...body } = data;
    return authenticatedAgentFetch<{ integracao: IntegracoesItem }>(context, "/integracoes", {
      tenantId,
      method: "POST",
      body: body,
    });
  });

export const updateIntegracao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { id, tenant_id: _ignored, ...body } = data;
    return authenticatedAgentFetch<{ integracao: IntegracoesItem }>(context, `/integracoes/${id}`, {
      tenantId,
      method: "PUT",
      body: body,
    });
  });

export const deleteIntegracao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return authenticatedAgentFetch<{ ok: boolean }>(context, `/integracoes/${data.id}`, {
      tenantId,
      method: "DELETE",
    });
  });
