import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getClienteByTenant } from "@/lib/clientes.functions";
import { listRamais, listFilas, listUras } from "@/lib/ramais.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/")({
  head: () => ({ meta: [{ title: "Cliente — Painel PABX" }] }),
  component: ClienteOverview,
});

function ClienteOverview() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(getClienteByTenant);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cliente", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
    retry: false,
  });
  const cliente = data?.cliente;

  const ramaisFn = useServerFn(listRamais);
  const {
    data: ramaisData,
    isLoading: ramaisLoading,
    error: ramaisError,
  } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
  });

  const filasFn = useServerFn(listFilas);
  const {
    data: filasData,
    isLoading: filasLoading,
    error: filasError,
  } = useQuery({
    queryKey: ["filas", tenantId],
    queryFn: () => filasFn({ data: { tenant_id: tenantId } }),
  });

  const urasFn = useServerFn(listUras);
  const {
    data: urasData,
    isLoading: urasLoading,
    error: urasError,
  } = useQuery({
    queryKey: ["uras", tenantId],
    queryFn: () => urasFn({ data: { tenant_id: tenantId } }),
  });

  const cotaRamal = cliente?.quantidade_ramais ?? 0;
  const criadosRamal = ramaisData?.ramais?.length ?? 0;
  const vagosRamal = Math.max(0, cotaRamal - criadosRamal);

  const cotaFila = cliente?.quantidade_filas ?? 0;
  const criadosFila = filasData?.filas?.length ?? 0;
  const vagosFila = Math.max(0, cotaFila - criadosFila);

  const cotaUra = cliente?.quantidade_uras ?? 0;
  const criadosUra = urasData?.uras?.length ?? 0;
  const vagosUra = Math.max(0, cotaUra - criadosUra);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            {isLoading ? "Carregando…" : (cliente?.razao_social ?? "Cliente não encontrado")}
          </h1>
          <p className="text-sm text-muted-foreground">
            ID: <span className="font-mono">{tenantId}</span>
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          Tenant #{tenantId}
        </Badge>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Email</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm break-all">{cliente?.email ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">CNPJ/CPF</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">{cliente?.cnpj ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cota de ramais</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{cotaRamal}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RamaisChart criadosRamal={criadosRamal} vagosRamal={vagosRamal} cotaRamal={cotaRamal} />
        <FilasChart criadosFila={criadosFila} vagosFila={vagosFila} cotaFila={cotaFila} />
        <UrasChart criadosUra={criadosUra} vagosUra={vagosUra} cotaUra={cotaUra} />
      </div>
    </div>
  );
}

function RamaisChart({
  criadosRamal,
  vagosRamal,
  cotaRamal,
}: {
  criadosRamal: number;
  vagosRamal: number;
  cotaRamal: number;
}) {
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctCriado = cotaRamal > 0 ? criadosRamal / cotaRamal : 0;

  const [animacao, setAnimacao] = useState(0);

  useEffect(() => {
    let frame: number;

    const inicio = performance.now();
    const duracao = 800;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracao, 1);

      setAnimacao(pctCriado * easeOutCubic(progresso));

      if (progresso < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [pctCriado]);

  const dash = c * animacao;

  const criadosAnimados = Math.round(criadosRamal * (animacao / pctCriado || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Ramais criados</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <svg width={size} height={size} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-primary"
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transform: "rotate(90deg) scaleX(-1)", transformOrigin: "center" }}
          />
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: 22 }}
          >
            {criadosAnimados}/{cotaRamal}
          </text>
        </svg>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
            <span>
              Ativos: <strong>{criadosRamal}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
            <span>
              Vagos: <strong>{vagosRamal}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilasChart({
  criadosFila,
  vagosFila,
  cotaFila,
}: {
  criadosFila: number;
  vagosFila: number;
  cotaFila: number;
}) {
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctCriado = cotaFila > 0 ? criadosFila / cotaFila : 0;

  const [animacao, setAnimacao] = useState(0);

  useEffect(() => {
    let frame: number;

    const inicio = performance.now();
    const duracao = 800;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracao, 1);

      setAnimacao(pctCriado * easeOutCubic(progresso));

      if (progresso < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [pctCriado]);

  const dash = c * animacao;

  const criadosAnimados = Math.round(criadosFila * (animacao / pctCriado || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Filas criadas</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <svg width={size} height={size} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-primary"
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transform: "rotate(90deg) scaleX(-1)", transformOrigin: "center" }}
          />
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: 22 }}
          >
            {criadosAnimados}/{cotaFila}
          </text>
        </svg>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
            <span>
              Ativas: <strong>{criadosFila}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
            <span>
              Vagas: <strong>{vagosFila}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UrasChart({
  criadosUra,
  vagosUra,
  cotaUra,
}: {
  criadosUra: number;
  vagosUra: number;
  cotaUra: number;
}) {
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctCriado = cotaUra > 0 ? criadosUra / cotaUra : 0;
  const [animacao, setAnimacao] = useState(0);

  useEffect(() => {
    let frame: number;

    const inicio = performance.now();
    const duracao = 800;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracao, 1);

      setAnimacao(pctCriado * easeOutCubic(progresso));

      if (progresso < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [pctCriado]);

  const dash = c * animacao;

  const criadosAnimados = Math.round(criadosUra * (animacao / pctCriado || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Uras criadas</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <svg width={size} height={size} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-primary"
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transform: "rotate(90deg) scaleX(-1)", transformOrigin: "center" }}
          />
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: 22 }}
          >
            {criadosAnimados}/{cotaUra}
          </text>
        </svg>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
            <span>
              Ativas: <strong>{criadosUra}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
            <span>
              Vagas: <strong>{vagosUra}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
