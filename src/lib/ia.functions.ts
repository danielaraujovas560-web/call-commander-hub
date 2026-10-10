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
      {
        tenantId,
      },
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
    }>(
      context,
      "/ia-models",
    );

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
    }>(
      context,
      "/ia-voices",
      {
        tenantId,
      },
    );

    return {
      tenantId,
      vozes: res.vozes ?? [],
    };
  });
