import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDailyCallSummary } from "@/lib/clientes.functions";

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}min`;
  }

  return `${minutes}min ${remainingSeconds}s`;
}

export function DailyCallSummary() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "daily-call-summary"],

    queryFn: async () => {
      console.log("[DailyCallSummary] iniciando request");

      const result = await getDailyCallSummary({});

      console.log("[DailyCallSummary] resposta:", result);

      return result;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resumo de chamadas</CardTitle>
        </CardHeader>

        <CardContent className="min-h-[220px] flex items-center justify-center">
          <span className="text-sm text-muted-foreground">
            Carregando...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.ok) {
    console.error("[DailyCallSummary] erro:", error);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Resumo de chamadas</CardTitle>
        </CardHeader>

        <CardContent className="min-h-[220px] flex items-center justify-center">
          <span className="text-sm text-destructive">
            Erro ao carregar resumo de chamadas.
          </span>
        </CardContent>
      </Card>
    );
  }

  const totalHoje = Number(data.today?.total ?? 0);
  const duracaoTotal = Number(data.today?.duracao_total ?? 0);
  const duracaoMedia = Number(data.today?.duracao_media ?? 0);
  const totalOntem = Number(data.yesterday?.total ?? 0);

  const variacao =
    totalOntem === 0
      ? totalHoje > 0
        ? 100
        : 0
      : ((totalHoje - totalOntem) / totalOntem) * 100;

  const entrada = (data.calls ?? [])
    .filter((row) => row.tipo_chamada === "Entrada")
    .reduce((total, row) => total + Number(row.quantidade), 0);

  const saida = (data.calls ?? [])
    .filter((row) => row.tipo_chamada === "Saida")
    .reduce((total, row) => total + Number(row.quantidade), 0);

  const chartData = [
    {
      tipo: "Entrada",
      quantidade: entrada,
    },
    {
      tipo: "Saída",
      quantidade: saida,
    },
  ];

  const variacaoPositiva = variacao > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo de chamadas</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Chamadas
            </p>

            <p className="text-2xl font-semibold">
              {totalHoje}
            </p>

            <p
              className={`text-xs font-medium ${
                variacao === 0
                  ? "text-muted-foreground"
                  : variacaoPositiva
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {variacao > 0 ? "+" : ""}
              {variacao.toFixed(1)}% comprado ao dia anterior
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Duração total
            </p>

            <p className="text-2xl font-semibold">
              {formatDuration(duracaoTotal)}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Média
            </p>

            <p className="text-2xl font-semibold">
              {formatDuration(Math.round(duracaoMedia))}
            </p>

            <p className="text-xs text-muted-foreground">
              por chamada atendida
            </p>
          </div>
        </div>

        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 10,
                right: 10,
                left: -20,
                bottom: 0,
              }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="tipo"
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                cursor={{ opacity: 0.08 }}
                formatter={(value) => [
                  `${value} chamadas`,
                  "Quantidade",
                ]}
              />

              <Bar
                dataKey="quantidade"
                radius={[6, 6, 0, 0]}
                maxBarSize={55}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
