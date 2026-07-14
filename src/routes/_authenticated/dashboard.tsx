import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Server } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel PABX" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { isAdmin } = useIsAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bem-vindo ao seu painel</h1>
        <p className="text-muted-foreground">
          Gerencie clientes e ramais do seu PABX virtual.
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
        {isAdmin && (
          <Link to="/admin/servidor">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <Server className="h-8 w-8 text-primary" />
                <CardTitle className="mt-2">Servidor</CardTitle>
                <CardDescription>Status do agente e dados do servidor</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
