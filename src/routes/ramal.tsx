import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getStoredRamalCreds, setStoredRamalCreds, type RamalCreds } from "@/lib/auth/ramal-creds";
import { useJsSipPhone } from "@/hooks/use-jssip-phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Phone, PhoneOff, PhoneIncoming, Delete } from "lucide-react";

export const Route = createFileRoute("/ramal")({
  ssr: false,
  beforeLoad: () => {
    if (!getStoredRamalCreds()) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Ramal — Painel PABX" }] }),
  component: RamalPage,
});

function RamalPage() {
  const [creds] = useState<RamalCreds | null>(() => getStoredRamalCreds());

  if (!creds) {
    window.location.href = "/auth";
    return null;
  }

  return <Softphone creds={creds} />;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function Softphone({ creds }: { creds: RamalCreds }) {
  const {
    phoneState, callState, remoteNumber, callDuration, remoteAudioRef, call, answer, hangup, sendDTMF,
  } = useJsSipPhone(creds);
  const [numero, setNumero] = useState("");

  function formatDuration(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function handleLogout() {
    setStoredRamalCreds(null);
    window.location.href = "/auth";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteAudioRef} autoPlay />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{creds.nome ?? creds.ramal}</CardTitle>
          <CardDescription>
            Ramal {creds.ramal} —{" "}
            {phoneState === "registered" && "Online"}
            {phoneState === "registering" && "Conectando…"}
            {phoneState === "failed" && "Falha ao conectar"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {callState === "idle" && (
            <>
              <Input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Número"
                className="text-center text-lg"
              />
              <div className="grid grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <Button key={k} type="button" variant="outline" onClick={() => setNumero((n) => n + k)}>
                    {k}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setNumero((n) => n.slice(0, -1))}>
                  <Delete className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!numero || phoneState !== "registered"}
                  onClick={() => call(numero)}
                >
                  <Phone className="mr-2 h-4 w-4" /> Ligar
                </Button>
              </div>
            </>
          )}

          {callState === "incoming" && (
            <div className="space-y-3 text-center">
              <p className="text-lg font-medium">Chamada de {remoteNumber}</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={answer}>
                  <PhoneIncoming className="mr-2 h-4 w-4" /> Atender
                </Button>
                <Button variant="destructive" className="flex-1" onClick={hangup}>
                  <PhoneOff className="mr-2 h-4 w-4" /> Recusar
                </Button>
              </div>
            </div>
          )}

          {(callState === "calling" || callState === "ringing") && (
            <div className="space-y-3 text-center">
              <p className="text-lg font-medium">Chamando {numero}…</p>
              <Button variant="destructive" className="w-full" onClick={hangup}>
                <PhoneOff className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            </div>
          )}

          {callState === "active" && (
            <div className="space-y-3 text-center">
              <p className="text-lg font-medium">Em chamada com {remoteNumber}</p>
              <p className="text-sm text-muted-foreground">{formatDuration(callDuration)}</p>
              <div className="grid grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <Button key={k} type="button" variant="outline" onClick={() => sendDTMF(k)}>
                    {k}
                  </Button>
                ))}
              </div>
              <Button variant="destructive" className="w-full" onClick={hangup}>
                <PhoneOff className="mr-2 h-4 w-4" /> Desligar
              </Button>
            </div>
          )}

          {callState === "ended" && (
            <p className="text-center text-sm text-muted-foreground">Chamada encerrada</p>
          )}

          <Button type="button" variant="ghost" className="w-full" onClick={handleLogout}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
