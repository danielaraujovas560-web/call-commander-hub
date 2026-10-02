import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { pingAgent, getMyTenant } from "@/lib/ramais.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Server } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel PABX" }] }),
  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ConfigPage,
});

function ConfigPage() {
  const tenant = useServerFn(getMyTenant);

  const t = useQuery({ queryKey: ["my-tenant"], queryFn: () => tenant() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Configure módulos do PABX.</p>
      </div>
      <div className="text-sm text-muted-foregound">Em breve.</div>
     </div>
 );
}
