import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { pingAgent, getMyTenant } from "@/lib/ramais.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Server } from "lucide-react";

export const Route = createFileRoute("/_authenticated/servidor")({
  head: () => ({ meta: [{ title: "Servidor — Painel PABX" }] }),
  component: ServidorPage,
});

function ServidorPage() {
  const ping = useServerFn(pingAgent);
  const tenant = useServerFn(getMyTenant);

  const health = useQuery({
    queryKey: ["agent-health"],
    queryFn: () => ping(),
    refetchInterval: 30_000,
  });

  const t = useQuery({ queryKey: ["my-tenant"], queryFn: () => tenant() });

  const ok = health.data?.ok;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Servidor</h1>
        <p className="text-sm text-muted-foreground">Status do agente HTTP do seu PABX.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Agente PABX
            </CardTitle>
            <CardDescription>Mini-agente HTTP no seu servidor Asterisk</CardDescription>
          </div>
          {ok ? (
            <Badge className="bg-green-600 hover:bg-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Online
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" />
              Offline
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {health.isLoading && <p className="text-muted-foreground">Verificando…</p>}
          {health.data?.ok && (
            <>
              <p>
                <span className="text-muted-foreground">Status:</span> {health.data.data?.status}
              </p>
              {health.data.data?.version && (
                <p>
                  <span className="text-muted-foreground">Versão:</span> {health.data.data.version}
                </p>
              )}
            </>
          )}
          {health.data && !health.data.ok && (
            <p className="text-destructive">{health.data.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
