import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { type RamalCreds } from "@/lib/auth/ramal-creds";
import { useRamalAuth } from "@/hooks/use-ramal-auth";

import { getRamalInfo, getRamalWebTicket } from "@/lib/ramais.functions";

import { useJsSipPhone } from "@/hooks/use-jssip-phone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Clock3,
  Delete,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Signal,
  UserRound,
  Volume2,
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
    call,
    answer,
    hangup,
    sendDTMF,
    unregister,
  } = useJsSipPhone(sipCreds);

  const [numero, setNumero] = useState("");

  const getRamalInfoFn = useServerFn(getRamalInfo);
  const getRamalWebTicketFn = useServerFn(getRamalWebTicket);

  const endpointId = creds.sip_username.replace(/-web$/, "");

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

  const isRegistered = phoneState === "registered";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Áudio remoto da chamada */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

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

                    <CardDescription>Chamada ativa</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6 p-6 text-center">
                    <div>
                      <p className="text-3xl font-semibold tracking-wide">{remoteNumber}</p>

                      <p className="mt-2 text-lg font-mono text-muted-foreground">
                        {formatDuration(callDuration)}
                      </p>
                    </div>

                    {/* Controles */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button type="button" variant="outline" className="h-12">
                        <Volume2 className="mr-2 h-4 w-4" />
                        Áudio
                      </Button>

                      <Button type="button" variant="outline" className="h-12">
                        Teclado
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
