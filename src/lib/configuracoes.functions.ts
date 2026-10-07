import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { authenticatedAgentFetch } from "./agent.server";

export interface Configuracoes {
  id: number;
  chave: string;
  valor: string | number | boolean | Record<string, unknown> | unknown[];
  tipo: "STRING" | "INT" | "BOOLEAN" | "JSON";
  descricao: string | null;
}

export const ConfiguracoesUpdate = z.object({
  id: z.number().int().positive().optional(),
  chave: z.string().min(1),
  valor: z.boolean(),
});

export const listConfiguracoes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const res = await authenticatedAgentFetch<Configuracoes[]>(context, "/config-geral");
    return res ?? [];
  });

export const getConfiguracoes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        chaves: z.array(z.string().min(1)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const query = data.chaves.join(",");

    return await authenticatedAgentFetch<Configuracoes[]>(
      context,
      `/config-geral?chaves=${encodeURIComponent(query)}`,
    );
  });

export const updateConfiguracoes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => ConfiguracoesUpdate.parse(d))
  .handler(async ({ data, context }) => {
    await authenticatedAgentFetch(context, `/config-geral/${data.chave}`, {
      method: "PUT",
      body: { valor: data.valor },
    });
  });
