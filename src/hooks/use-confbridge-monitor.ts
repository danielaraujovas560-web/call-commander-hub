import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRamalMonitorTicket } from "@/lib/ramais.functions";

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
  | { tipo: "CONFERENCIAS_INICIAL"; conferencias: ConferenciaAoVivo[]; ts: number }
  | { tipo: "CONFERENCIA_ATUALIZADA"; conferencia: ConferenciaAoVivo; ts: number }
  | { tipo: "CONFERENCIA_REMOVIDA"; sala: string; ts: number };

export function useConfbridgeMonitor(tenantId?: number) {
  const obterTicket = useServerFn(getRamalMonitorTicket);
  const [salas, setSalas] = useState<Record<string, ConferenciaAoVivo>>({});
  const [conectado, setConectado] = useState(false);
  const [sincronizado, setSincronizado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;
    setSalas({});
    setConectado(false);
    setSincronizado(false);
    setErro(null);

    if (!tenantId) return;

    function reconectar() {
      if (cancelado) return;
      const espera = Math.min(15000, 1500 * Math.pow(1.7, tentativas++));
      retry = setTimeout(() => void conectar(), espera);
    }

    async function conectar() {
      if (cancelado) return;
      try {
        const { ticket } = await obterTicket({ data: { tenant_id: tenantId } });
        if (cancelado) return;
        const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${protocolo}//${window.location.host}/ws/conferencias?ticket=${encodeURIComponent(ticket)}`;
        const ws = new WebSocket(url);
        socket = ws;

        ws.onopen = () => {
          if (cancelado) return ws.close();
          setConectado(true);
          setErro(null);
          tentativas = 0;
        };
        ws.onmessage = (ev) => {
          if (cancelado) return;
          try {
            const m = JSON.parse(String(ev.data)) as Mensagem;
            if (m.tipo === "CONFERENCIAS_INICIAL") {
              const atualizado: Record<string, ConferenciaAoVivo> = {};
              for (const sala of m.conferencias ?? []) atualizado[sala.sala] = sala;
              setSalas(atualizado);
              setSincronizado(true);
            } else if (m.tipo === "CONFERENCIA_ATUALIZADA" && m.conferencia) {
              setSalas(atual => ({ ...atual, [m.conferencia.sala]: m.conferencia }));
            } else if (m.tipo === "CONFERENCIA_REMOVIDA") {
              setSalas(atual => {
                const novo = { ...atual };
                delete novo[m.sala];
                return novo;
              });
            }
          } catch (e) {
            console.error("[CONFBRIDGE] Mensagem inválida", e);
          }
        };
        ws.onerror = () => setErro("Falha na conexão de monitoramento");
        ws.onclose = () => {
          if (cancelado) return;
          setConectado(false);
          setSincronizado(false);
          setSalas({}); // não manter conferências fantasmas durante perda de conexão
          reconectar();
        };
      } catch (e) {
        if (cancelado) return;
        setConectado(false);
        setErro(e instanceof Error ? e.message : "Não foi possível obter ticket");
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
  }, [tenantId, obterTicket]);

  const conferencias = useMemo(() => Object.values(salas).sort((a, b) => a.sala.localeCompare(b.sala)), [salas]);
  const totalParticipantes = conferencias.reduce((total, sala) => total + sala.participantes.length, 0);
  return { conferencias, conectado, sincronizado, erro, totalParticipantes };
}
