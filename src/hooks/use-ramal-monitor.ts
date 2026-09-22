import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getRamalMonitorTicket } from "@/lib/ramais.functions";

export type RamalState =
  | "IDLE"
  | "DIALING"
  | "RING"
  | "RINGING"
  | "IN_CALL";

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

type WsEvento = WsEstadoInicial | WsRamalStatus | WsRamalRemovido;

export const estadoRamalLabel: Record<RamalState, string> = {
  IDLE: "Livre",
  DIALING: "Discando",
  RING: "Chamando",
  RINGING: "Chamando",
  IN_CALL: "Em ligação",
};

export function useRamalMonitor() {
  const queryClient = useQueryClient();
  const [ramais, setRamais] = useState<RamaisMap>({});
  const [conectado, setConectado] = useState(false);

useEffect(() => {
  let ws: WebSocket | null = null;
  let cancelled = false;
  let reconectando = false;
  let timerReconexao: ReturnType<typeof setTimeout> | null = null;

  async function conectar() {
    if (cancelled || reconectando) return;

    reconectando = true;

    try {
      console.log("[RAMAL-MONITOR] solicitando ticket...");

      const { ticket } = await getRamalMonitorTicket();

      if (cancelled) return;

      console.log("[RAMAL-MONITOR] ticket recebido");

      const protocolo =
        window.location.protocol === "https:" ? "wss:" : "ws:";

      const wsUrl =
        `${protocolo}//${window.location.host}/ws/ramais?ticket=` +
        encodeURIComponent(ticket);

      console.log("[RAMAL-MONITOR] conectando WebSocket...");

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[RAMAL-MONITOR] WebSocket conectado");
        setConectado(true);

        reconectando = false;
      };

      ws.onmessage = (event) => {
        try {
          const mensagem: WsEvento = JSON.parse(event.data);

          if (mensagem.tipo === "CDR_UPDATED") {
            queryClient.invalidateQueries({ queryKey: ["ramais-monitoramento"] });
            return;
          }

          if (mensagem.tipo === "ESTADO_INICIAL") {
            console.log(
              "[RAMAL-MONITOR] estado inicial recebido:",
              mensagem.ramais
            );

            setRamais(mensagem.ramais ?? {});
            return;
          }

          if (mensagem.tipo === "RAMAL_REMOVIDO") {
            console.log(
              "[RAMAL-MONITOR] ramal removido:",
              mensagem.endpoint
            );

            setRamais((atual) => {
              const novo = { ...atual };
              delete novo[mensagem.endpoint];
              return novo;
            });

            return;
          }

          if (mensagem.tipo === "RAMAL_STATUS") {
            console.log(
              "[RAMAL-MONITOR] status:",
              mensagem.endpoint,
              mensagem.state
            );

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
          console.error(
            "[RAMAL-MONITOR] erro ao processar evento:",
            error
          );
        }
      };

      ws.onerror = (error) => {
        console.error(
          "[RAMAL-MONITOR] erro WebSocket:",
          error
        );

        setConectado(false);
      };

      ws.onclose = (event) => {
        console.log("[RAMAL-MONITOR] ===== CONEXÃO FECHADA =====");
        console.log("[RAMAL-MONITOR] code:", event.code);
        console.log("[RAMAL-MONITOR] reason:", event.reason);
        console.log("[RAMAL-MONITOR] wasClean:", event.wasClean);
        console.log(
          "[RAMAL-MONITOR] time:",
          new Date().toISOString()
        );
        console.log("[RAMAL-MONITOR] ===========================");

        setConectado(false);

        // Saiu da página/componente desmontado.
        // NÃO reconectar.
        if (cancelled) {
          console.log(
            "[RAMAL-MONITOR] componente desmontado, não reconectando"
          );
          return;
        }

        // Já existe uma tentativa de reconexão.
        if (reconectando) {
          console.log(
            "[RAMAL-MONITOR] reconexão já em andamento"
          );
          return;
        }

        console.log(
          "[RAMAL-MONITOR] WebSocket caiu, reconectando em 2s..."
        );

        timerReconexao = setTimeout(() => {
          if (!cancelled) {
            conectar();
          }
        }, 2000);
      };
    } catch (error) {
      console.error(
        "[RAMAL-MONITOR] falha ao obter ticket:",
        error
      );

      setConectado(false);

      reconectando = false;

      if (cancelled) return;

      console.log(
        "[RAMAL-MONITOR] tentando novamente em 2s..."
      );

      timerReconexao = setTimeout(() => {
        if (!cancelled) {
          conectar();
        }
      }, 2000);
    }
  }

  conectar();

  return () => {
    console.log(
      "[RAMAL-MONITOR] desmontando monitor"
    );

    cancelled = true;

    if (timerReconexao) {
      clearTimeout(timerReconexao);
      timerReconexao = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }
  };
}, []);

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
