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

export type ConferenciaSoftphone = {
  sala: string;
  nome: string;
  tipo: "INTERNA" | "CHAMADA";
  participantes: { nome: string; ramal: string; canal: string }[];
};

export const getRamalConferenciasAtivas = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ ramalToken: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { agentFetch } = await import("./agent.server");
    const response = await agentFetch<{ conferencias: ConferenciaSoftphone[] }>(
      "/conferencias-softphone/estado?dispositivo=web",
      { bearerToken: data.ramalToken },
    );
    return response.conferencias ?? [];
  });

const RamalConferenciaInput = z.object({
  ramalToken: z.string().min(1),
  ramal: z.string().trim().regex(/^\d{1,20}$/),
  dispositivoConvidado: z.enum(["base", "web", "mobile"]).default("web"),
});

export const iniciarConferenciaTemporariaRamal = createServerFn({ method: "POST" })
  .validator((data: unknown) => RamalConferenciaInput.parse(data))
  .handler(async ({ data }) => {
    const { agentFetch } = await import("./agent.server");
    return agentFetch<{ ok: true; id: number; sala: string; estado: string }>(
      "/conferencias-softphone/temporaria",
      {
        method: "POST",
        bearerToken: data.ramalToken,
        body: {
          ramal: data.ramal,
          dispositivoOrigem: "web",
          dispositivoConvidado: data.dispositivoConvidado,
        },
      },
    );
  });

export const convidarRamalParaConferencia = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      ramalToken: z.string().min(1),
      sala: z.string().min(1).max(80),
      ramal: z.string().trim().regex(/^\d{1,20}$/),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { agentFetch } = await import("./agent.server");
    return agentFetch<{ ok: true; status: string; sala: string }>(
      "/conferencias-softphone/convidar",
      {
        method: "POST",
        bearerToken: data.ramalToken,
        body: { sala: data.sala, ramal: data.ramal },
      },
    );
  });
