import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  if (!desde) return "00:00";

  const inicio = new Date(desde).getTime();

  if (Number.isNaN(inicio)) {
    return "00:00";
  }

  const segundosTotais = Math.max(
    0,
    Math.floor((agora - inicio) / 1000),
  );

  const horas = Math.floor(segundosTotais / 3600);
  const minutos = Math.floor((segundosTotais % 3600) / 60);
  const segundos = segundosTotais % 60;

  if (horas > 0) {
    return [
      String(horas).padStart(2, "0"),
      String(minutos).padStart(2, "0"),
      String(segundos).padStart(2, "0"),
    ].join(":");
  }

  return [
    String(minutos).padStart(2, "0"),
    String(segundos).padStart(2, "0"),
  ].join(":");
}

function descricaoChamada(
  state: RamalState,
  numero: string | null,
) {
  switch (state) {
    case "DIALING":
      return {
        titulo: "Discando",
        numero,
      };

    case "RING":
    case "RINGING":
      return {
        titulo: "Chamando",
        numero,
      };

    case "IN_CALL":
      return {
        titulo: "Em atendimento",
        numero,
      };

    default:
      return {
        titulo: "Livre",
        numero: null,
      };
  }
}

function indicadorEstado(state: RamalState) {
  switch (state) {
    case "IN_CALL":
      return "bg-muted-foreground/40";

    case "DIALING":
      return "bg-blue-500";

    case "RING":
    case "RINGING":
      return "bg-amber-500";

    default:
      return "bg-emerald-500";
  }
}

export function MonitoramentoRamais() {
  const { ramais, resumo, conectado } = useRamalMonitor();

  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => {
      setAgora(Date.now());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  const { data: ramaisData } = useQuery({
    queryKey: ["ramais-monitoramento"],
    queryFn: () =>
      listRamais({
        data: {
          tenant_id: undefined,
        },
      }),
  });

  const dadosPorEndpoint = useMemo(() => {
    return Object.fromEntries(
      (ramaisData?.ramais ?? [])
        .filter((ramal) => ramal.endpoint_id)
        .map((ramal) => [
          ramal.endpoint_id,
          {
            nome: ramal.ramal_nome,
            ramal: ramal.ramal,
            feitas: ramal.ligacoes_feitas,
            recebidas: ramal.ligacoes_recebidas,
          },
        ]),
    );
  }, [ramaisData]);

  const listaRamais = useMemo(() => {
    return Object.values(ramais)
      .map((ramal) => {
        const dados = dadosPorEndpoint[ramal.endpoint];

        return {
          ...ramal,
          nome: dados?.nome ?? null,
          ramal: dados?.ramal ?? ramal.endpoint,
          feitas: dados?.feitas ?? 0,
          recebidas: dados?.recebidas ?? 0,
        };
      })
      .sort((a, b) => {
        const nomeA = a.nome ?? a.ramal;
        const nomeB = b.nome ?? b.ramal;

        return nomeA.localeCompare(nomeB, "pt-BR");
      });
  }, [ramais, dadosPorEndpoint]);

return (
  <section className="space-y-5">
    {/* Cabeçalho da seção */}
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Monitoramento de Ramais
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhamento em tempo real dos ramais conectados.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            conectado ? "bg-emerald-500" : "bg-red-500"
          }`}
        />

        <span className="font-medium">
          {conectado ? "Monitoramento ativo" : "Desconectado"}
        </span>
      </div>
    </div>

    {/* Resumo */}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total
            </p>

            <p className="mt-1 text-2xl font-bold tabular-nums">
              {resumo.total}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Livres
            </p>

            <p className="mt-1 text-2xl font-bold tabular-nums">
              {resumo.livres}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <Phone className="h-5 w-5 text-emerald-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Discando
            </p>

            <p className="mt-1 text-2xl font-bold tabular-nums">
              {resumo.discando}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <PhoneOutgoing className="h-5 w-5 text-blue-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Tocando
            </p>

            <p className="mt-1 text-2xl font-bold tabular-nums">
              {resumo.tocando}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <PhoneIncoming className="h-5 w-5 text-amber-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Em ligação
            </p>

            <p className="mt-1 text-2xl font-bold tabular-nums">
              {resumo.ocupados}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PhoneCall className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Tabela */}
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          Ramais conectados
        </CardTitle>

        <CardDescription>
          Somente ramais atualmente registrados no PABX são exibidos.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[1050px]">
            {/* Cabeçalho */}
            <div className="grid grid-cols-[minmax(280px,2fr)_140px_160px_minmax(320px,2fr)_120px] items-center border-b px-6 py-3">
              <div className="text-left text-xs font-semibold uppercase tracking-wide">
                Agente
              </div>

              <div className="text-center text-xs font-semibold uppercase tracking-wide">
                Feitas
              </div>

              <div className="text-center text-xs font-semibold uppercase tracking-wide">
                Recebidas
              </div>

              <div className="text-left text-xs font-semibold uppercase tracking-wide">
                Chamada atual
              </div>

              <div className="text-right text-xs font-semibold uppercase tracking-wide">
                Duração
              </div>
            </div>

            {/* Linhas */}
            {listaRamais.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center px-6">
                <div className="text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />

                  <p className="font-medium">
                    Nenhum ramal conectado
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Os ramais aparecerão aqui assim que forem registrados.
                  </p>
                </div>
              </div>
            ) : (
              listaRamais.map((ramal) => {
                const chamada = descricaoChamada(
                  ramal.state,
                  ramal.numero,
                );

                const duracao =
                  ramal.state === "IN_CALL"
                    ? formatarDuracao(ramal.desde, agora)
                    : "00:00";

                return (
                  <div
                    key={ramal.endpoint}
                    className="grid grid-cols-[minmax(280px,2fr)_140px_160px_minmax(320px,2fr)_120px] items-center border-b px-6 py-4 last:border-b-0 hover:bg-muted/30"
                  >
                    {/* Agente */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicadorEstado(
                          ramal.state,
                        )}`}
                      />

                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">
                          {ramal.nome ?? ramal.endpoint}
                        </span>

                        <span className="shrink-0">
                          -
                        </span>

                        <span className="shrink-0 font-mono text-sm font-medium">
                          {ramal.ramal}
                        </span>
                      </div>
                    </div>

                    {/* Feitas */}
                    <div className="text-center font-mono text-sm font-semibold tabular-nums">
                      {ramal.feitas}
                    </div>

                    {/* Recebidas */}
                    <div className="text-center font-mono text-sm font-semibold tabular-nums">
                      {ramal.recebidas}
                    </div>

                    {/* Chamada atual */}
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {chamada.titulo}
                      </span>

                      {chamada.numero && (
                        <>
                          <span className="shrink-0">
                            -
                          </span>

                          <span className="shrink-0 font-mono text-sm font-medium">
                            {chamada.numero}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Duração */}
                    <div className="text-right font-mono text-sm font-semibold tabular-nums">
                      {duracao}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
)};
