import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Server, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel PABX" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bem-vindo ao seu painel</h1>
        <p className="text-muted-foreground">
          Gerencie clientes, ramais e troncos do seu PABX virtual.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/clientes">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <Building2 className="h-8 w-8 text-primary" />
              <CardTitle className="mt-2">Clientes</CardTitle>
              <CardDescription>Cadastre clientes e acesse seus ramais</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link to="/servidor">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <Server className="h-8 w-8 text-primary" />
              <CardTitle className="mt-2">Servidor</CardTitle>
              <CardDescription>Status do agente e dados do servidor</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Card className="opacity-60">
          <CardHeader>
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="mt-2">Relatórios</CardTitle>
            <CardDescription>DDD, filas, URA, pesquisa (em breve)</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </div>
  );
}
