import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface IA {
  id: number;
  nome: string;
  confianca_minima: number;
  tempo_maximo: number;
  silencio_apos_fala: number;
  ativa: boolean;

  modelo_logico: {
    id: number;
    nome: string;
    provider: string;
    modelo: string;
  };

  modelo_voz: {
    id: number;
    nome: string;
    provider: string;
    modelo: string;
  };

  voz: {
    id: number;
    nome: string;
    voice_id: string;
  } | null;
}

export interface IaModel {
  id: number;
  nome: string;
  provider: string;
  modelo: string;
  tipo: "Logico" | "Voz";
  ativo: boolean;
}

export interface IaVoice {
  id: number;
  nome: string;
  voice_id: string;

  modelo: {
    id: number;
    nome: string;
    provider: string;
    modelo: string;
  };
}

const iaInputSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  ia_model_id_logica: z.number().int().positive(),
  ia_voice_id: z.number().int().positive(),
  confianca_minima: z.number().min(0).max(1).default(0.75),
  tempo_maximo: z.number().int().nonnegative().default(15),
  silencio_apos_fala: z.number().nonnegative().default(1.5),
  ativa: z.boolean().default(true),
});

const iaVoiceInputSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  voice_id: z.string().trim().min(1).max(100),
  ia_model_id: z.number().int().positive(),
});

export const listIa = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const res = await authenticatedAgentFetch<{ ia: IA[] }>(
      context,
      `/ia?tenant=${tenantId}`,
      { tenantId },
    );

    return {
      tenantId,
      ia: res.ia ?? [],
    };
  });

export const listIaModels = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const res = await authenticatedAgentFetch<{
      modelos: IaModel[];
    }>(context, "/ia-models");

    return {
      modelos: res.modelos ?? [],
    };
  });

export const listIaVoices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    const res = await authenticatedAgentFetch<{
      vozes: IaVoice[];
    }>(context, "/ia-voices", { tenantId });

    return {
      tenantId,
      vozes: res.vozes ?? [],
    };
  });

export const createIa = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => iaInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    return await authenticatedAgentFetch(
      context,
      "/ia",
      {
        method: "POST",
        tenantId,
        body: data,
      },
    );
  });

export const updateIa = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        ...iaInputSchema.shape,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    const { id, ...body } = data;

    return await authenticatedAgentFetch(
      context,
      `/ia/${id}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteIa = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    return await authenticatedAgentFetch(
      context,
      `/ia/${data.id}`,
      {
        method: "DELETE",
        tenantId,
      },
    );
  });

export const createIaVoice = createServerFn({
  method: "POST",
})
  .middleware([requireAuth])
  .validator((d: unknown) => iaVoiceInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    return await authenticatedAgentFetch(
      context,
      "/ia-voices",
      {
        method: "POST",
        tenantId,
        body: data,
      },
    );
  });

export const updateIaVoice = createServerFn({
  method: "POST",
})
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        ...iaVoiceInputSchema.shape,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    const { id, ...body } = data;

    return await authenticatedAgentFetch(
      context,
      `/ia-voices/${id}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteIaVoice = createServerFn({
  method: "POST",
})
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      undefined,
    );

    return await authenticatedAgentFetch(
      context,
      `/ia-voices/${data.id}`,
      {
        method: "DELETE",
        tenantId,
      },
    );
  });
