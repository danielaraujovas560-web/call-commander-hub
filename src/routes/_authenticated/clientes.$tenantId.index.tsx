import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getClienteByTenant } from "@/lib/clientes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, PhoneCall, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/")({
  head: () => ({ meta: [{ title: "Cliente — Painel PABX" }] }),
  component: ClienteOverview,
});

function ClienteOverview() {
  const { tenantId: tenantParam } = Route.useParams();
  const tenantId = Number(tenantParam);
  const fn = useServerFn(getClienteByTenant);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cliente", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
    retry: false,
  });
  const cliente = data?.cliente;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            {isLoading
              ? "Carregando…"
              : cliente?.razao_social ?? "Cliente não encontrado"}
          </h1>
          <p className="text-sm text-muted-foreground">
            ID/Tenant: <span className="font-mono">{tenantId}</span>
            {cliente?.cnpj ? ` · CNPJ ${cliente.cnpj}` : ""}
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
          <CardContent className="font-mono text-sm break-all">
            {cliente?.email ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Cota de ramais
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {cliente?.quantidade_ramais ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">CNPJ/CPF</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {cliente?.cnpj ?? "—"}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link
            to="/clientes/$tenantId/ramais"
            params={{ tenantId: tenantParam }}
          >
            <PhoneCall className="mr-2 h-4 w-4" /> Gerenciar ramais
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            to="/clientes/$tenantId/relatorios/entrada"
            params={{ tenantId: tenantParam }}
          >
            <BarChart3 className="mr-2 h-4 w-4" /> Ver relatórios
          </Link>
        </Button>
      </div>
    </div>
  );
}
