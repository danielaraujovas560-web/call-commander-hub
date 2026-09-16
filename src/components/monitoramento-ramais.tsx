import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatarHorario } from "@/lib/utils";
import {
  Users,
  Phone,
  PhoneCall,
  PhoneOutgoing,
  PhoneIncoming,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { listRamais } from "@/lib/ramais.functions";
import {
  useRamalMonitor,
  type RamalState,
} from "@/hooks/use-ramal-monitor";

function formatarDuracao(desde: string | null, agora: number) {
  if (!desde) return "—";
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return "—";
  const s = Math.max(0, Math.floor((agora - inicio) / 1000));
  const horas = Math.floor(s / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  const segundos = s % 60;
  if (horas > 0)
    return [horas, minutos, segundos].map((n) => String(n).padStart(2, "0")).join(":");
  return [minutos, segundos].map((n) => String(n).padStart(2, "0")).join(":");
}

function descricaoChamada(state: RamalState, numero: string | null) {
  switch (state) {
    case "DIALING":  return { titulo: "Discando",       numero };
    case "RING":
    case "RINGING":  return { titulo: "Chamando",       numero };
    case "IN_CALL":  return { titulo: "Em atendimento", numero };
    default:         return { titulo: "Livre",          numero: null };
  }
}

type IndicadorVariant = "livre" | "discando" | "tocando" | "em-ligacao";

function indicadorVariant(state: RamalState): IndicadorVariant {
  switch (state) {
    case "IN_CALL":          return "em-ligacao";
    case "DIALING":          return "discando";
    case "RING":
    case "RINGING":          return "tocando";
    default:                 return "livre";
  }
}

const INDICADOR_COR: Record<IndicadorVariant, string> = {
  "livre":      "bg-emerald-500",
  "discando":   "bg-blue-500",
  "tocando":    "bg-amber-500",
  "em-ligacao": "bg-muted-foreground/40",
};

export function MonitoramentoRamais() {
  const { ramais, resumo, conectado } = useRamalMonitor();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: ramaisData } = useQuery({
    queryKey: ["ramais-monitoramento"],
    queryFn: () => listRamais({ data: { tenant_id: undefined } }),
  });

  const dadosPorEndpoint = useMemo(() => {
    return Object.fromEntries(
      (ramaisData?.ramais ?? [])
        .filter((r) => r.endpoint_id)
        .map((r) => [
          r.endpoint_id,
          { nome: r.ramal_nome, ramal: r.ramal, feitas: r.ligacoes_feitas, recebidas: r.ligacoes_recebidas },
        ]),
    );
  }, [ramaisData]);

  const listaRamais = useMemo(() => {
    return Object.values(ramais)
      .map((r) => {
        const d = dadosPorEndpoint[r.endpoint];
        return { ...r, nome: d?.nome ?? null, ramal: d?.ramal ?? r.endpoint, feitas: d?.feitas ?? 0, recebidas: d?.recebidas ?? 0 };
      })
      .sort((a, b) => (a.nome ?? a.ramal).localeCompare(b.nome ?? b.ramal, "pt-BR"));
  }, [ramais, dadosPorEndpoint]);

  const cards = [
    { label: "Total",      valor: resumo.total,    icon: <Users className="h-5 w-5" />,                       bg: "bg-primary/10",      cor: "" },
    { label: "Livres",     valor: resumo.livres,   icon: <Phone className="h-5 w-5 text-emerald-600" />,      bg: "bg-emerald-500/10",  cor: "" },
    { label: "Discando",   valor: resumo.discando, icon: <PhoneOutgoing className="h-5 w-5 text-blue-600" />, bg: "bg-blue-500/10",     cor: "" },
    { label: "Tocando",    valor: resumo.tocando,  icon: <PhoneIncoming className="h-5 w-5 text-amber-600" />,bg: "bg-amber-500/10",    cor: "" },
    { label: "Em ligação", valor: resumo.ocupados, icon: <PhoneCall className="h-5 w-5" />,                   bg: "bg-primary/10",      cor: "" },
  ];

  return (
    <section className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Monitoramento de Ramais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhamento em tempo real dos ramais conectados.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${conectado ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="font-medium">{conectado ? "Monitoramento ativo" : "Desconectado"}</span>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, valor, icon, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
                {icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="border-b px-6 py-4">
          <CardTitle className="text-base">Ramais conectados</CardTitle>
          <CardDescription>Somente ramais atualmente registrados no PABX são exibidos.</CardDescription>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Agente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Login</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Feitas</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Recebidas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Chamada atual</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Duração</th>
              </tr>
            </thead>

            <tbody>
              {listaRamais.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex min-h-[180px] items-center justify-center">
                      <div className="text-center">
                        <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
                        <p className="font-medium">Nenhum ramal conectado</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Os ramais aparecerão aqui assim que forem registrados.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                listaRamais.map((ramal) => {
                  const chamada  = descricaoChamada(ramal.state, ramal.numero);
                  const variante = indicadorVariant(ramal.state);
                  const duracao  = ramal.state === "IN_CALL"
                    ? formatarDuracao(ramal.desde, agora)
                    : "—";

                  return (
                    <tr
                      key={ramal.endpoint}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      {/* Agente */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${INDICADOR_COR[variante]}`} />
                          <span className="font-semibold">{ramal.nome ?? ramal.endpoint}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-mono text-xs text-muted-foreground">{ramal.ramal}</span>
                        </div>
                      </td>

                      {/* Login */}
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatarHorario(ramal.conectadoDesde)}
                      </td>

                      {/* Feitas */}
                      <td className="px-6 py-4 text-center font-mono font-semibold tabular-nums">
                        {ramal.feitas}
                      </td>

                      {/* Recebidas */}
                      <td className="px-6 py-4 text-center font-mono font-semibold tabular-nums">
                        {ramal.recebidas}
                      </td>

                      {/* Chamada atual */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{chamada.titulo}</span>
                          {chamada.numero && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="font-mono text-xs">{chamada.numero}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Duração */}
                      <td className="px-6 py-4 text-right font-mono font-semibold tabular-nums">
                        {duracao}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
