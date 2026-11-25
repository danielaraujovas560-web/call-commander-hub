import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { type RamalCreds } from "@/lib/auth/ramal-creds";
import { useRamalAuth } from "@/hooks/use-ramal-auth";

import { getRamalInfo, getRamalWebTicket } from "@/lib/ramais.functions";
import {
  getRamalAgenda,
  getRamalConferenciasAgenda,
  getRamalConferenciasAtivas,
  iniciarConferenciaTemporariaRamal,
  convidarRamalParaConferencia,
} from "@/lib/ramal-softphone.functions";

import { useJsSipPhone } from "@/hooks/use-jssip-phone";
import { useRamalConfbridgeMonitor } from "@/hooks/use-ramal-confbridge-monitor";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  Check,
  RefreshCw,
  Clock3,
  Delete,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Signal,
  UserRound,
  Mic,
  MicOff,
  Pause,
  Play,
  Users,
  Video,
  VideoOff,
} from "lucide-react";

export const Route = createFileRoute("/ramal")({
  ssr: false,

  head: () => ({
    meta: [{ title: "Ramal — Painel PABX" }],
  }),

  component: RamalPage,
});

function RamalPage() {
  const { creds, refresh, logout } = useRamalAuth();

  if (!creds) {
    window.location.href = "/auth";
    return null;
  }

  return <Softphone creds={creds} refresh={refresh} logout={logout} />;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

type RamalInfo = {
  cliente: {
    cnpj: string;
    razao_social: string;
  } | null;

  ultimasChamadas: {
    origem: string;
    destino: string;
    date_time: string;
    tipo_chamada: "Entrada" | "Saida";
    context: "Interno" | "Externo";
    linkedid: string;
    duracao: number;
  }[];
};

function Softphone({
  creds,
  refresh,
  logout,
}: {
  creds: RamalCreds;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const sipCreds = useMemo(
    () => ({
      sip_username: creds.sip_username,
      sip_password: creds.sip_password,
      wss_url: creds.wss_url,
      sip_domain: creds.sip_domain,
    }),
    [creds.sip_username, creds.sip_password, creds.wss_url, creds.sip_domain],
  );

  const {
    phoneState,
    callState,
    remoteNumber,
    callDuration,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    isVideoEnabled,
    hasRemoteVideo,
    toggleVideo,
    call,
    answer,
    hangup,
    sendDTMF,
    isMuted,
    isOnHold,
    toggleMute,
    toggleHold,
    blindTransfer,
    startAttendedTransfer,
    completeAttendedTransfer,
    abortAttendedTransfer,
    unregister,
  } = useJsSipPhone(sipCreds);

  const [numero, setNumero] = useState("");
  const [ramalConvidado, setRamalConvidado] = useState("");
  const [ramalTransferencia, setRamalTransferencia] = useState("");
  const [buscaAgenda, setBuscaAgenda] = useState("");
  const [painelAcao, setPainelAcao] = useState<"conferencia" | "transferencia" | null>(null);
  const [transferenciaAssistidaAtiva, setTransferenciaAssistidaAtiva] = useState(false);
  const [processandoTransferencia, setProcessandoTransferencia] = useState(false);
  const [acompanharConferencias, setAcompanharConferencias] = useState(false);
  const [iniciandoConferencia, setIniciandoConferencia] = useState(false);
  const [convidandoRamal, setConvidandoRamal] = useState(false);
  const [erroConferencia, setErroConferencia] = useState("");
  const [avisoConferencia, setAvisoConferencia] = useState("");
  useEffect(() => {
    if (!avisoConferencia) return;
    const timer = window.setTimeout(() => setAvisoConferencia(""), 3500);
    return () => window.clearTimeout(timer);
  }, [avisoConferencia]);

  const getRamalInfoFn = useServerFn(getRamalInfo);
  const getRamalWebTicketFn = useServerFn(getRamalWebTicket);
  const getRamalAgendaFn = useServerFn(getRamalAgenda);
  const getRamalConferenciasAgendaFn = useServerFn(getRamalConferenciasAgenda);
  const getRamalConferenciasAtivasFn = useServerFn(getRamalConferenciasAtivas);
  const iniciarConferenciaTemporariaFn = useServerFn(iniciarConferenciaTemporariaRamal);
  const convidarRamalParaConferenciaFn = useServerFn(convidarRamalParaConferencia);

  const endpointId = creds.sip_username.replace(/-(web|mobile)$/i, "");
  const { minhaConferencia, emConferencia } =
    useRamalConfbridgeMonitor(creds.token, endpointId);

  const queryClient = useQueryClient();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    async function conectar() {
      try {
        const { ticket } = await getRamalWebTicketFn({
          data: {
            ramalToken: creds.token,
          },
        });

        if (cancelled) return;

        const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";

        const wsUrl =
          `${protocolo}//${window.location.host}/ws/ramais?ticket=` + encodeURIComponent(ticket);

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          try {
            const mensagem = JSON.parse(event.data);

            if (mensagem.tipo === "CDR_UPDATED" && mensagem.endpointIds?.includes(endpointId)) {
              queryClient.invalidateQueries({
                queryKey: ["ramal-info", endpointId],
              });
            }
          } catch (error) {
            console.error("[RAMAL] Erro ao processar evento:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("[RAMAL] Erro WebSocket:", error);
        };

        ws.onclose = (event) => {};
      } catch (error) {
        console.error("[RAMAL] Erro ao obter ticket:", error);
      }
    }

    conectar();

    return () => {
      cancelled = true;

      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, [creds.token, endpointId, queryClient]);

  const {
    data: ramaisAgenda = [],
    isLoading: carregandoAgenda,
    refetch: atualizarAgenda,
  } = useQuery({
    queryKey: ["ramal-agenda", endpointId],
    queryFn: () => getRamalAgendaFn({ data: { ramalToken: creds.token } }),
    enabled: painelAcao !== null,
    staleTime: 60_000,
  });

  const ramaisAgendaFiltrados = useMemo(() => {
    const termo = buscaAgenda.trim().toLocaleLowerCase("pt-BR");
    return ramaisAgenda.filter((item) =>
      item.nome.toLocaleLowerCase("pt-BR").includes(termo) || item.ramal.includes(termo),
    );
  }, [ramaisAgenda, buscaAgenda]);

  function selecionarRamalDaAgenda(ramal: string) {
    if (painelAcao === "conferencia") setRamalConvidado(ramal);
    if (painelAcao === "transferencia") setRamalTransferencia(ramal);
  }

  const { data: conferenciasAtivas = [], refetch: atualizarConferenciasAtivas } = useQuery({
    queryKey: ["ramal-conferencias-ativas", endpointId],
    queryFn: () =>
      getRamalConferenciasAtivasFn({
        data: { ramalToken: creds.token },
      }),
    refetchInterval: acompanharConferencias ? 4000 : false,
  });

  useEffect(() => {
    if (acompanharConferencias && conferenciasAtivas.length > 0) {
      setAcompanharConferencias(false);
    }
  }, [acompanharConferencias, conferenciasAtivas.length]);

  const { data: conferencias = [], isLoading: carregandoConferencias } = useQuery({
    queryKey: ["ramal-conferencias-agenda", endpointId],
    queryFn: () =>
      getRamalConferenciasAgendaFn({
        data: { ramalToken: creds.token },
      }),
  });

  const { data: ramalInfo } = useQuery({
    queryKey: ["ramal-info", endpointId],
    queryFn: () =>
      getRamalInfoFn({
        data: {
          ramalToken: creds.token,
        },
      }),
  });

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");

    const secs = (seconds % 60).toString().padStart(2, "0");

    return `${minutes}:${secs}`;
  }

  function formatCallTime(date: string) {
    const data = new Date(date);

    return data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleLogout() {
    await unregister();
    await logout();

    window.location.href = "/auth";
  }

  function handleKey(key: string) {
    if (callState === "active" && key) {
      sendDTMF(key);
      return;
    }

    if (callState === "idle") {
      setNumero((value) => value + key);
    }
  }

  function handleDelete() {
    if (callState !== "idle") {
      return;
    }

    setNumero((value) => value.slice(0, -1));
  }

  function handleCall() {
    if (!numero || phoneState !== "registered") {
      return;
    }

    call(numero);
  }

  async function handleTransferenciaCega() {
    const destino = ramalTransferencia.trim();
    if (!/^\d{1,20}$/.test(destino) || callState !== "active" || isOnHold || processandoTransferencia) return;

    setProcessandoTransferencia(true);
    setErroConferencia("");
    setAvisoConferencia("");
    try {
      const enviado = await blindTransfer(destino);
      if (!enviado) throw new Error("Não foi possível enviar o comando de transferência.");
      setAvisoConferencia("Comando de transferência enviado.");
      setRamalTransferencia("");
      setPainelAcao(null);
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Falha na transferência cega.");
    } finally {
      setProcessandoTransferencia(false);
    }
  }

  async function handleIniciarTransferenciaAssistida() {
    const destino = ramalTransferencia.trim();
    if (!/^\d{1,20}$/.test(destino) || callState !== "active" || isOnHold || processandoTransferencia) return;

    setProcessandoTransferencia(true);
    setErroConferencia("");
    setAvisoConferencia("");
    try {
      const enviado = await startAttendedTransfer(destino);
      if (!enviado) throw new Error("Não foi possível iniciar a consulta com o ramal.");
      setTransferenciaAssistidaAtiva(true);
      setAvisoConferencia("Consulta iniciada para o ramal " + destino + ". Converse com ele antes de concluir.");
      setRamalTransferencia("");
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Falha na transferência assistida.");
    } finally {
      setProcessandoTransferencia(false);
    }
  }

  async function handleConcluirTransferenciaAssistida() {
    if (!transferenciaAssistidaAtiva || processandoTransferencia) return;
    setProcessandoTransferencia(true);
    try {
      const enviado = await completeAttendedTransfer();
      if (!enviado) throw new Error("Não foi possível concluir a transferência.");
      setAvisoConferencia("Transferência concluída.");
      setTransferenciaAssistidaAtiva(false);
      setPainelAcao(null);
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Falha ao concluir a transferência.");
    } finally {
      setProcessandoTransferencia(false);
    }
  }

  async function handleCancelarTransferenciaAssistida() {
    if (!transferenciaAssistidaAtiva || processandoTransferencia) return;
    setProcessandoTransferencia(true);
    try {
      const enviado = await abortAttendedTransfer();
      if (!enviado) throw new Error("Não foi possível cancelar a consulta.");
      setAvisoConferencia("Consulta cancelada.");
      setTransferenciaAssistidaAtiva(false);
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Falha ao cancelar a consulta.");
    } finally {
      setProcessandoTransferencia(false);
    }
  }
  async function handleIniciarConferenciaTemporaria() {
    const ramal = ramalConvidado.trim();
    if (!/^\d{1,20}$/.test(ramal) || callState !== "active" || isOnHold) return;

    setIniciandoConferencia(true);
    setErroConferencia("");
    setAvisoConferencia("");
    try {
      const resultado = await iniciarConferenciaTemporariaFn({
        data: { ramalToken: creds.token, ramal },
      });
      setAcompanharConferencias(true);
      setAvisoConferencia(
        `Convite enviado para o ramal ${ramal}. A chamada será convertida em conferência quando ele atender.`,
      );
      setRamalConvidado("");
      setPainelAcao(null);
      void atualizarConferenciasAtivas();
      console.info("[RAMAL] Conferência temporária solicitada:", resultado.sala);
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Não foi possível iniciar a conferência.");
    } finally {
      setIniciandoConferencia(false);
    }
  }

  async function handleConvidarParaSala(sala: string) {
    const ramal = ramalConvidado.trim();
    if (!/^\d{1,20}$/.test(ramal)) return;

    setConvidandoRamal(true);
    setErroConferencia("");
    setAvisoConferencia("");
    try {
      await convidarRamalParaConferenciaFn({
        data: { ramalToken: creds.token, sala, ramal },
      });
      setAvisoConferencia(`Convite enviado para o ramal ${ramal}.`);
      setRamalConvidado("");
      setPainelAcao(null);
      void atualizarConferenciasAtivas();
    } catch (error) {
      setErroConferencia(error instanceof Error ? error.message : "Não foi possível convidar o ramal.");
    } finally {
      setConvidandoRamal(false);
    }
  }

  useEffect(() => {
    if (emConferencia) {
      setPainelAcao(null);
      setTransferenciaAssistidaAtiva(false);
      setErroConferencia("");
      setAvisoConferencia("");
    }
  }, [emConferencia]);

  useEffect(() => {
    if (callState !== "active") {
      setPainelAcao(null);
      setTransferenciaAssistidaAtiva(false);
      setProcessandoTransferencia(false);
    }
  }, [callState]);

  const isRegistered = phoneState === "registered";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Áudio remoto da chamada */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div
        hidden={callState !== "active" || (!hasRemoteVideo && !isVideoEnabled)}
        className="fixed bottom-4 right-4 z-40 grid max-w-sm gap-2"
        aria-label="Vídeo da chamada"
      >
        <video ref={remoteVideoRef} autoPlay playsInline className="max-h-56 w-full rounded-lg bg-black object-contain" />
        <video ref={localVideoRef} autoPlay playsInline muted className="max-h-32 w-32 justify-self-end rounded-lg bg-black object-cover" />
      </div>

      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Painel PABX</p>

            <h1 className="text-lg font-semibold">Ramal Web</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{creds.nome ?? "Usuário"}</p>

              <p className="text-xs text-muted-foreground">Ramal {creds.ramal}</p>
            </div>

            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  isRegistered
                    ? "bg-emerald-500"
                    : phoneState === "registering"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />

              {phoneState === "registered" && "Online"}
              {phoneState === "registering" && "Conectando…"}
              {phoneState === "failed" && "Falha ao conectar"}
              {phoneState !== "registered" &&
                phoneState !== "registering" &&
                phoneState !== "failed" &&
                "Offline"}
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-7xl p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* ===================================================== */}
          {/* ESQUERDA                                              */}
          {/* ===================================================== */}

          <section className="space-y-6">
            {/* Empresa — temporário */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <CardTitle className="text-base">
                      {ramalInfo?.cliente?.razao_social ?? "Carregando..."}
                    </CardTitle>

                    <CardDescription>Informações da empresa</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">CNPJ</p>

                    <p className="mt-1 text-sm font-medium">
                      {ramalInfo?.cliente?.cnpj ?? "Carregando..."}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Ramal</p>

                    <p className="mt-1 text-sm font-medium">{creds.ramal}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Histórico — temporário */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock3 className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <CardTitle className="text-base">Últimas chamadas</CardTitle>

                    <CardDescription>Chamadas recentes deste ramal</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
                {ramalInfo?.ultimasChamadas.length ? (
                  ramalInfo.ultimasChamadas.map((chamada) => {
                    const incoming = chamada.tipo_chamada === "Entrada";

                    const numero = incoming ? chamada.origem : chamada.destino;

                    return (
                      <HistoryItem
                        key={chamada.linkedid}
                        type={incoming ? "incoming" : "outgoing"}
                        number={numero}
                        time={formatCallTime(chamada.date_time)}
                        duration={formatDuration(chamada.duracao)}
                        context={chamada.context}
                        onClick={() => setNumero(numero)}
                      />
                    );
                  })
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma chamada hoje</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informações do ramal — temporário */}
            <Card>
              <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
                <InfoItem
                  icon={<UserRound className="h-4 w-4" />}
                  label="Ramal"
                  value={creds.ramal}
                />

                <InfoItem
                  icon={<Signal className="h-4 w-4" />}
                  label="Status"
                  value={isRegistered ? "Registrado" : "Desconectado"}
                />

                <InfoItem icon={<Phone className="h-4 w-4" />} label="Tecnologia" value="WebRTC" />
              </CardContent>
            </Card>
          </section>

          {/* ===================================================== */}
          {/* DIREITA — SOFTPHONE                                  */}
          {/* ===================================================== */}

          <section>
            <Card className="overflow-hidden">
              {/* ================================================= */}
              {/* IDLE — DISCADOR                                  */}
              {/* ================================================= */}

              {callState === "idle" && (
                <>
                  <CardHeader className="border-b text-center">
                    <CardTitle>Discador</CardTitle>

                    <CardDescription>Ramal {creds.ramal}</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-5 p-6">
                    <Input
                      value={numero}
                      onChange={(e) => {
                        const valor = e.target.value.replace(/[^0-9*#]/g, "");
                        setNumero(valor);
                      }}
                      placeholder="Digite um número"
                      inputMode="tel"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCall();
                        }
                      }}
                      className="h-14 text-center text-2xl font-medium tracking-wider"
                    />

                    <div className="grid grid-cols-3 gap-3">
                      {KEYS.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          className="h-14 text-xl font-medium"
                          onClick={() => handleKey(key)}
                        >
                          {key}
                        </Button>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 flex-1"
                        onClick={handleDelete}
                        disabled={!numero}
                      >
                        <Delete className="mr-2 h-4 w-4" />
                        Apagar
                      </Button>

                      <Button
                        type="button"
                        className="h-12 flex-1"
                        disabled={!numero || !isRegistered}
                        onClick={handleCall}
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        Ligar
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* ================================================= */}
              {/* INCOMING — CHAMADA RECEBIDA                     */}
              {/* ================================================= */}

              {callState === "incoming" && (
                <>
                  <CardHeader className="border-b text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <PhoneIncoming className="h-7 w-7 text-primary" />
                    </div>

                    <CardTitle className="mt-3">Chamada recebida</CardTitle>

                    <CardDescription>Alguém está ligando para seu ramal</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6 p-6 text-center">
                    <div>
                      <p className="text-3xl font-semibold tracking-wide">{remoteNumber}</p>

                      <p className="mt-1 text-sm text-muted-foreground">Chamada recebida</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button type="button" className="h-14" onClick={answer}>
                        <PhoneIncoming className="mr-2 h-5 w-5" />
                        Atender
                      </Button>

                      <Button type="button" variant="destructive" className="h-14" onClick={hangup}>
                        <PhoneOff className="mr-2 h-5 w-5" />
                        Recusar
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* ================================================= */}
              {/* CALLING / RINGING — CHAMANDO                    */}
              {/* ================================================= */}

              {(callState === "calling" || callState === "ringing") && (
                <>
                  <CardHeader className="border-b text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Phone className="h-7 w-7 animate-pulse text-primary" />
                    </div>

                    <CardTitle className="mt-3">
                      {callState === "calling" ? "Iniciando chamada" : "Chamando…"}
                    </CardTitle>

                    <CardDescription>Aguardando atendimento</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-8 p-6 text-center">
                    <div>
                      <p className="text-3xl font-semibold tracking-wide">{numero}</p>

                      <p className="mt-1 text-sm text-muted-foreground">Chamando</p>
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      className="h-16 w-full text-base"
                      onClick={hangup}
                    >
                      <PhoneOff className="mr-2 h-5 w-5" />
                      Cancelar chamada
                    </Button>
                  </CardContent>
                </>
              )}

              {/* ================================================= */}
              {/* ACTIVE — EM CHAMADA                              */}
              {/* ================================================= */}

              {callState === "active" && (
                <>
                  <CardHeader className="border-b text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <Phone className="h-7 w-7 text-emerald-600" />
                    </div>

                    <CardTitle className="mt-3">Em chamada</CardTitle>

                    <CardDescription>
                      {emConferencia
                        ? `Conferência · ${minhaConferencia?.sala ?? ""}`
                        : "Chamada ativa"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6 p-6 text-center">
                    <div>
                      <p className="text-3xl font-semibold tracking-wide">{remoteNumber}</p>

                      <p className="mt-2 text-lg font-mono text-muted-foreground">
                        {formatDuration(callDuration)}
                      </p>
                    </div>

                    {/* Controles da chamada */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant={isMuted ? "default" : "outline"}
                        className="h-12"
                        onClick={toggleMute}
                      >
                        {isMuted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                        {isMuted ? "Ativar microfone" : "Silenciar"}
                      </Button>

                      {!emConferencia && (
                        <Button
                          type="button"
                          variant={isOnHold ? "default" : "outline"}
                          className="h-12"
                          onClick={toggleHold}
                        >
                          {isOnHold ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                          {isOnHold ? "Retomar" : "Colocar em espera"}
                        </Button>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant={isVideoEnabled ? "default" : "outline"}
                      className="h-12 w-full"
                      onClick={() => void toggleVideo().catch((error) => {
                        setErroConferencia(error instanceof Error ? error.message : "Não foi possível ativar o vídeo.");
                      })}
                      disabled={isOnHold}
                    >
                      {isVideoEnabled ? <VideoOff className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
                      {isVideoEnabled ? "Desligar câmera" : "Ativar câmera"}
                    </Button>

                    {emConferencia && minhaConferencia ? (
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Você está em uma conferência</p>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700">Conectado</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Sala {minhaConferencia.sala} · {minhaConferencia.participantes.length} participante(s)
                        </p>
                        <div className="max-h-36 space-y-1 overflow-y-auto">
                          {minhaConferencia.participantes.map((participante) => (
                            <div key={participante.canal} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate">{participante.nome || participante.numero || participante.canal}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {participante.mutado ? "Mutado" : participante.falando ? "Falando" : "Conectado"}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={ramalConvidado}
                            onChange={(event) => setRamalConvidado(event.target.value.replace(/\D/g, "").slice(0, 20))}
                            placeholder="Ramal para convidar"
                            inputMode="numeric"
                            aria-label="Ramal para convidar à conferência"
                            className="min-w-0"
                            disabled={convidandoRamal}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleConvidarParaSala(minhaConferencia.sala)}
                            disabled={!/^\d{3,20}$/.test(ramalConvidado) || convidandoRamal}
                          >
                            {convidandoRamal ? "Chamando…" : "Convidar"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Para sair, use Desligar. A sala permanece ativa para os demais participantes.
                        </p>
                      </div>
                    ) : (
                    <>
                    {/* Ações da chamada comum */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant={painelAcao === "conferencia" ? "default" : "outline"}
                        className="h-12"
                        onClick={() => {
                          setErroConferencia("");
                          setAvisoConferencia("");
                          setBuscaAgenda("");
                          setPainelAcao((atual) => atual === "conferencia" ? null : "conferencia");
                        }}
                        disabled={isOnHold}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Conferência
                      </Button>
                      <Button
                        type="button"
                        variant={painelAcao === "transferencia" ? "default" : "outline"}
                        className="h-12"
                        onClick={() => {
                          setErroConferencia("");
                          setAvisoConferencia("");
                          setBuscaAgenda("");
                          setPainelAcao((atual) => atual === "transferencia" ? null : "transferencia");
                        }}
                        disabled={isOnHold}
                      >
                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                        Transferir
                      </Button>
                    </div>

                    {/* DTMF */}
                    <div className="grid grid-cols-3 gap-2">
                      {KEYS.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => sendDTMF(key)}
                        >
                          {key}
                        </Button>
                      ))}
                    </div>

                    {painelAcao === "conferencia" && !emConferencia && (
                      <div className="space-y-3 rounded-lg border p-4 text-left">
                        <div>
                          <p className="text-sm font-medium">
                            {conferenciasAtivas.length > 0 ? "Adicionar participante" : "Iniciar conferência"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Informe somente o ramal. O PABX localiza automaticamente os dispositivos disponíveis.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={buscaAgenda}
                              onChange={(e) => setBuscaAgenda(e.target.value)}
                              placeholder="Buscar nome ou ramal"
                              aria-label="Buscar ramal para conferência"
                              className="min-w-0"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Atualizar agenda"
                              onClick={() => void atualizarAgenda()}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                            {carregandoAgenda ? (
                              <p className="p-3 text-center text-xs text-muted-foreground">Carregando agenda…</p>
                            ) : ramaisAgendaFiltrados.length ? (
                              ramaisAgendaFiltrados.map((item) => (
                                <button
                                  key={item.ramal}
                                  type="button"
                                  onClick={() => selecionarRamalDaAgenda(item.ramal)}
                                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted ${ramalConvidado === item.ramal ? "bg-primary/10 text-primary" : ""}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium">{item.nome}</span>
                                    <span className="block text-xs text-muted-foreground">Ramal {item.ramal}</span>
                                  </span>
                                  {ramalConvidado === item.ramal && <Check className="h-4 w-4 shrink-0" />}
                                </button>
                              ))
                            ) : (
                              <p className="p-3 text-center text-xs text-muted-foreground">
                                {ramaisAgenda.length ? "Nenhum ramal encontrado." : "Nenhum ramal disponível na agenda."}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={ramalConvidado}
                            onChange={(e) => setRamalConvidado(e.target.value.replace(/\D/g, "").slice(0, 20))}
                            placeholder="Número do ramal"
                            inputMode="numeric"
                            className="min-w-0"
                            disabled={iniciandoConferencia || convidandoRamal}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              const sala = conferenciasAtivas[0];
                              if (sala) void handleConvidarParaSala(sala.sala);
                              else void handleIniciarConferenciaTemporaria();
                            }}
                            disabled={!/^\d{3,20}$/.test(ramalConvidado) || iniciandoConferencia || convidandoRamal}
                          >
                            {iniciandoConferencia || convidandoRamal ? "Chamando…" : conferenciasAtivas.length > 0 ? "Convidar" : "Iniciar"}
                          </Button>
                        </div>
                        {isOnHold && (
                          <p className="text-xs text-muted-foreground">Retome a chamada antes de iniciar a conferência.</p>
                        )}
                      </div>
                    )}

                    {painelAcao === "transferencia" && !emConferencia && (
                      <div className="space-y-3 rounded-lg border p-4 text-left">
                        <div>
                          <p className="text-sm font-medium">Transferir chamada</p>
                          <p className="text-xs text-muted-foreground">
                            Digite o ramal de destino e escolha o tipo de transferência.
                          </p>
                        </div>
                        {!transferenciaAssistidaAtiva && (
                          <>
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Input
                                  value={buscaAgenda}
                                  onChange={(e) => setBuscaAgenda(e.target.value)}
                                  placeholder="Buscar nome ou ramal"
                                  aria-label="Buscar ramal para transferência"
                                  className="min-w-0"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label="Atualizar agenda"
                                  onClick={() => void atualizarAgenda()}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                                {carregandoAgenda ? (
                                  <p className="p-3 text-center text-xs text-muted-foreground">Carregando agenda…</p>
                                ) : ramaisAgendaFiltrados.length ? (
                                  ramaisAgendaFiltrados.map((item) => (
                                    <button
                                      key={item.ramal}
                                      type="button"
                                      onClick={() => selecionarRamalDaAgenda(item.ramal)}
                                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted ${ramalTransferencia === item.ramal ? "bg-primary/10 text-primary" : ""}`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate font-medium">{item.nome}</span>
                                        <span className="block text-xs text-muted-foreground">Ramal {item.ramal}</span>
                                      </span>
                                      {ramalTransferencia === item.ramal && <Check className="h-4 w-4 shrink-0" />}
                                    </button>
                                  ))
                                ) : (
                                  <p className="p-3 text-center text-xs text-muted-foreground">
                                    {ramaisAgenda.length ? "Nenhum ramal encontrado." : "Nenhum ramal disponível na agenda."}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Input
                              value={ramalTransferencia}
                              onChange={(e) => setRamalTransferencia(e.target.value.replace(/\D/g, "").slice(0, 20))}
                              placeholder="Número ou ramal"
                              inputMode="numeric"
                              className="min-w-0"
                              disabled={processandoTransferencia}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleTransferenciaCega}
                                disabled={!/^\d{3,20}$/.test(ramalTransferencia) || processandoTransferencia}
                              >
                                {processandoTransferencia ? "Enviando…" : "Cega"}
                              </Button>
                              <Button
                                type="button"
                                onClick={handleIniciarTransferenciaAssistida}
                                disabled={!/^\d{3,20}$/.test(ramalTransferencia) || processandoTransferencia}
                              >
                                {processandoTransferencia ? "Chamando…" : "Assistida"}
                              </Button>
                            </div>
                          </>
                        )}
                        {transferenciaAssistidaAtiva && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              Consulta em andamento. Converse com o destino e depois conclua ou cancele.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                onClick={handleConcluirTransferenciaAssistida}
                                disabled={processandoTransferencia}
                              >
                                Concluir
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancelarTransferenciaAssistida}
                                disabled={processandoTransferencia}
                              >
                                Cancelar consulta
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    </>
                    )}

                    {erroConferencia && <p role="alert" className="text-xs text-destructive text-left">{erroConferencia}</p>}
                    {avisoConferencia && <p role="status" className="text-xs text-emerald-600 text-left">{avisoConferencia}</p>}

                    {/* Desligar */}
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-14 w-full text-base"
                      onClick={hangup}
                    >
                      <PhoneOff className="mr-2 h-5 w-5" />
                      Desligar
                    </Button>
                  </CardContent>
                </>
              )}

              {/* ================================================= */}
              {/* ENDED — CHAMADA ENCERRADA                       */}
              {/* ================================================= */}

              {callState === "ended" && (
                <CardContent className="flex min-h-[500px] flex-col items-center justify-center gap-4 p-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <PhoneOff className="h-7 w-7 text-muted-foreground" />
                  </div>

                  <div>
                    <p className="text-lg font-semibold">Chamada encerrada</p>

                    <p className="mt-1 text-sm text-muted-foreground">A chamada foi finalizada</p>
                  </div>

                  <Button type="button" variant="outline" onClick={() => setNumero("")}>
                    Voltar ao discador
                  </Button>
                </CardContent>
              )}
            </Card>

            {conferenciasAtivas.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">Salas em andamento</CardTitle>
                      <CardDescription>Conferências das quais seu ramal participa</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conferenciasAtivas.map((sala) => (
                    <div key={sala.sala} className="space-y-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{sala.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {sala.participantes.length} participante(s)
                          {sala.participantes.length
                            ? ` · ${sala.participantes.map((p) => p.nome).join(", ")}`
                            : ""}
                        </p>
                      </div>

                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {callState === "idle" && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">Conferências</CardTitle>
                      <CardDescription>Entre em uma sala disponível do seu cliente</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {carregandoConferencias ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">Carregando salas…</p>
                  ) : conferencias.length ? (
                    conferencias.map((sala) => (
                      <div key={sala.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sala.nome}</p>
                          <p className="text-xs text-muted-foreground">Ramal {sala.ramal}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!isRegistered}
                          onClick={() => {
                            setAcompanharConferencias(true);
                            call(sala.ramal);
                          }}
                        >
                          <Phone className="mr-2 h-4 w-4" />
                          Entrar
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="py-3 text-center text-sm text-muted-foreground">
                      Nenhuma conferência disponível.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Sair */}
            <Button type="button" variant="ghost" className="mt-4 w-full" onClick={handleLogout}>
              Sair
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
}

function HistoryItem({
  type,
  number,
  time,
  duration,
  context,
  onClick,
}: {
  type: "incoming" | "outgoing";
  number: string;
  time: string;
  duration: string;
  context: "Interno" | "Externo";
  onClick: () => void;
}) {
  const incoming = type === "incoming";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border bg-background px-4 py-3 text-left transition hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </div>

        <div>
          <p className="text-sm font-medium">{number}</p>

          <p className="text-xs text-muted-foreground">
            {incoming ? "Recebida" : "Realizada"} · {context} · {time}
          </p>
        </div>
      </div>

      <div className="text-right space-y-1">
        <span className="block text-xs text-muted-foreground">{duration}</span>
      </div>
    </button>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{icon}</div>

      <div>
        <p className="text-xs text-muted-foreground">{label}</p>

        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
