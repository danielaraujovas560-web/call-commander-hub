import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRamalWebTicket } from "@/lib/ramais.functions";

export type ParticipanteConferencia = {
  canal: string;
  nome: string;
  numero: string;
  mutado: boolean;
  falando: boolean;
};

export type ConferenciaAoVivo = {
  sala: string;
  tenantId: number;
  tipo: "INTERNA" | "CHAMADA";
  conferenciaId: number;
  participantes: ParticipanteConferencia[];
  total: number;
};

type Mensagem =
  | { tipo: "CONFERENCIAS_INICIAL"; conferencias: ConferenciaAoVivo[] }
  | { tipo: "CONFERENCIA_ATUALIZADA"; conferencia: ConferenciaAoVivo }
  | { tipo: "CONFERENCIA_REMOVIDA"; sala: string };

export function useRamalConfbridgeMonitor(ramalToken: string, ramal: string) {
  const obterTicket = useServerFn(getRamalWebTicket);
  const [salas, setSalas] = useState<Record<string, ConferenciaAoVivo>>({});
  const [conectado, setConectado] = useState(false);
  const [sincronizado, setSincronizado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;

    setSalas({});
    setConectado(false);
    setSincronizado(false);

    function reconectar() {
      if (cancelado) return;
      const espera = Math.min(15000, 1500 * Math.pow(1.7, tentativas++));
      retry = setTimeout(() => void conectar(), espera);
    }

    async function conectar() {
      if (cancelado) return;
      try {
        const { ticket } = await obterTicket({ data: { ramalToken } });
        if (cancelado) return;
        const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocolo}//${window.location.host}/ws/conferencias?ticket=${encodeURIComponent(ticket)}`);
        socket = ws;

        ws.onopen = () => {
          if (cancelado) return ws.close();
          setConectado(true);
          tentativas = 0;
        };
        ws.onmessage = (ev) => {
          if (cancelado) return;
          try {
            const mensagem = JSON.parse(String(ev.data)) as Mensagem;
            if (mensagem.tipo === "CONFERENCIAS_INICIAL") {
              const atualizadas: Record<string, ConferenciaAoVivo> = {};
              for (const sala of mensagem.conferencias ?? []) atualizadas[sala.sala] = sala;
              setSalas(atualizadas);
              setSincronizado(true);
            } else if (mensagem.tipo === "CONFERENCIA_ATUALIZADA" && mensagem.conferencia) {
              setSalas((atual) => ({ ...atual, [mensagem.conferencia.sala]: mensagem.conferencia }));
            } else if (mensagem.tipo === "CONFERENCIA_REMOVIDA") {
              setSalas((atual) => {
                const novo = { ...atual };
                delete novo[mensagem.sala];
                return novo;
              });
            }
          } catch (error) {
            console.error("[RAMAL][CONFBRIDGE] Evento inválido:", error);
          }
        };
        ws.onclose = () => {
          if (cancelado) return;
          setConectado(false);
          setSincronizado(false);
          setSalas({});
          reconectar();
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (cancelado) return;
        console.error("[RAMAL][CONFBRIDGE] Falha ao conectar:", error);
        setConectado(false);
        reconectar();
      }
    }

    void conectar();
    return () => {
      cancelado = true;
      if (retry) clearTimeout(retry);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    };
  }, [ramalToken, ramal, obterTicket]);

  const conferencias = useMemo(() => Object.values(salas), [salas]);
  const minhaConferencia = useMemo(() => {
    const ramalLogico = String(ramal).replace(/-(web|mobile)$/i, "");
    return conferencias.find((sala) => sala.participantes.some((p) => {
      const canal = String(p.canal || "");
      const match = /^PJSIP\\/(.+?)-[0-9a-f]{8,16}$/i.exec(canal);
      return match?.[1]?.replace(/-(web|mobile)$/i, "") === ramalLogico;
    })) ?? null;
  }, [conferencias, ramal]);

  return { conferencias, minhaConferencia, emConferencia: Boolean(minhaConferencia), conectado, sincronizado };
}
