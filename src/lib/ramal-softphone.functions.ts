import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ConferenciaAgendaItem = {
  id: number;
  nome: string;
  ramal: string;
};

export const getRamalConferenciasAgenda = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ ramalToken: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { agentFetch } = await import("./agent.server");
    const response = await agentFetch<{ conferencia: ConferenciaAgendaItem[] }>(
      "/conferencias-agenda",
      { bearerToken: data.ramalToken },
    );
    return response.conferencia ?? [];
  });
