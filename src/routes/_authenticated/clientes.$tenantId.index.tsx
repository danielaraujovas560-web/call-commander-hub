import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getClienteByTenant } from "@/lib/clientes.functions";
import { listRamais } from "@/lib/ramais.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

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
  const { data: ramaisData } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
  });

  const cota = cliente?.quantidade_ramais ?? 0;
  const criados = ramaisData?.ramais?.length ?? 0;
  const vagos = Math.max(0, cota - criados);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            {isLoading ? "Carregando…" : cliente?.razao_social ?? "Cliente não encontrado"}
          </h1>
          <p className="text-sm text-muted-foreground">
            ID/Tenant: <span className="font-mono">{tenantId}</span>
            {cliente?.cnpj ? ` · CNPJ ${cliente.cnpj}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="font-mono">Tenant #{tenantId}</Badge>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Email</CardTitle></CardHeader>
          <CardContent className="font-mono text-sm break-all">{cliente?.email ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">CNPJ/CPF</CardTitle></CardHeader>
          <CardContent className="font-mono text-sm">{cliente?.cnpj ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Cota de ramais</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{cota}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RamaisChart criados={criados} vagos={vagos} cota={cota} />
      </div>
    </div>
  );
}

function RamaisChart({ criados, vagos, cota }: { criados: number; vagos: number; cota: number }) {
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctCriado = cota > 0 ? criados / cota : 0;
  const dash = c * pctCriado;

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
            strokeDashoffset={c / 4}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: 22 }}
          >
            {criados}/{cota}
          </text>
        </svg>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
            <span>Ativos: <strong>{criados}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
            <span>Vagos: <strong>{vagos}</strong></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
