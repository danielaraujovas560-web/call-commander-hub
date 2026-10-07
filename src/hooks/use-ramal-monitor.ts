import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getRamalMonitorTicket } from "@/lib/ramais.functions";

export type RamalState = "IDLE" | "DIALING" | "RING" | "RINGING" | "IN_CALL";

export type RamalStatus = {
  endpoint: string;
  state: RamalState;
  numero: string | null;
  linkedid: string | null;
  desde: string | null;
  conectadoDesde: string | null;
};

type RamaisMap = Record<string, RamalStatus>;

type WsEstadoInicial = {
  tipo: "ESTADO_INICIAL";
  ramais: RamaisMap;
  ts: number;
};

type WsRamalStatus = {
  tipo: "RAMAL_STATUS";
  endpoint: string;
  state: RamalState;
  numero: string | null;
  linkedid: string | null;
  desde: string | null;
  conectadoDesde: string | null;
  ts: number;
};

type WsRamalRemovido = {
  tipo: "RAMAL_REMOVIDO";
  endpoint: string;
  ts: number;
};

type WsCdrUpdated = {
  tipo: "CDR_UPDATED";
  endpointIds: string[];
  ts: number;
};

type WsEvento = WsEstadoInicial | WsRamalStatus | WsRamalRemovido | WsCdrUpdated;

export const estadoRamalLabel: Record<RamalState, string> = {
  IDLE: "Livre",
  DIALING: "Discando",
  RING: "Chamando",
  RINGING: "Chamando",
  IN_CALL: "Em ligação",
};

export function useRamalMonitor(tenantId?: number) {
  const queryClient = useQueryClient();
  const [ramais, setRamais] = useState<RamaisMap>({});
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;

    async function conectar() {
      if (cancelled) return;

      // 1. Se já existir um socket antigo, desvincula eventos e fecha antes de criar outro
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
      }

      try {
        const { ticket } = await getRamalMonitorTicket({ data: { tenant_id: tenantId } });

        if (cancelled) return;

        const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl =
          `${protocolo}//${window.location.host}/ws/ramais?ticket=` + encodeURIComponent(ticket);

        const socket = new WebSocket(wsUrl);
        ws = socket;

        socket.onopen = () => {
          if (cancelled) {
            socket.close();
            return;
          }
          setConectado(true);
        };

        socket.onmessage = (event) => {
          try {
            const mensagem: WsEvento = JSON.parse(event.data);

            if (mensagem.tipo === "CDR_UPDATED") {
              queryClient.invalidateQueries({ queryKey: ["ramais-monitoramento"] });
              return;
            }

            if (mensagem.tipo === "ESTADO_INICIAL") {
              setRamais(mensagem.ramais ?? {});
              return;
            }

            if (mensagem.tipo === "RAMAL_REMOVIDO") {
              setRamais((atual) => {
                const novo = { ...atual };
                delete novo[mensagem.endpoint];
                return novo;
              });
              return;
            }

            if (mensagem.tipo === "RAMAL_STATUS") {
              setRamais((atual) => ({
                ...atual,
                [mensagem.endpoint]: {
                  endpoint: mensagem.endpoint,
                  state: mensagem.state,
                  numero: mensagem.numero ?? null,
                  linkedid: mensagem.linkedid ?? null,
                  desde: mensagem.desde ?? null,
                  conectadoDesde: mensagem.conectadoDesde ?? null,
                },
              }));
            }
          } catch (error) {
            console.error("[RAMAL-MONITOR] erro ao processar evento:", error);
          }
        };

        socket.onerror = (error) => {
          console.error("[RAMAL-MONITOR] erro WebSocket:", error);
          setConectado(false);
        };

        socket.onclose = (event) => {
          setConectado(false);

          if (cancelled) {
            return;
          }

          timerReconexao = setTimeout(() => {
            if (!cancelled) {
              conectar();
            }
          }, 2000);
        };
      } catch (error) {
        console.error("[RAMAL-MONITOR] falha ao obter ticket:", error);
        setConectado(false);

        if (cancelled) return;

        timerReconexao = setTimeout(() => {
          if (!cancelled) {
            conectar();
          }
        }, 2000);
      }
    }

    conectar();

    return () => {
      cancelled = true;

      if (timerReconexao) {
        clearTimeout(timerReconexao);
        timerReconexao = null;
      }

      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
      }
    };
  }, [tenantId]);

  const resumo = useMemo(() => {
    const lista = Object.values(ramais);

    return {
      total: lista.length,
      livres: lista.filter((ramal) => ramal.state === "IDLE").length,
      ocupados: lista.filter((ramal) => ramal.state === "IN_CALL").length,
      discando: lista.filter((ramal) => ramal.state === "DIALING").length,
      tocando: lista.filter((ramal) => ramal.state === "RINGING").length,
    };
  }, [ramais]);

  return {
    ramais,
    resumo,
    conectado,
  };
}
