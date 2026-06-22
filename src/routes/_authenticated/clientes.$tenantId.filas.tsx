import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ListOrdered, RefreshCw } from "lucide-react";
import { listCdrFila } from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/filas")({
  head: () => ({ meta: [{ title: "Filas — Cliente — Painel PABX" }] }),
  component: FilasPage,
});

function FilasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listCdrFila);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["cdr_fila", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListOrdered className="h-6 w-6" /> Filas
          </h1>
          <p className="text-sm text-muted-foreground">Histórico de atendimentos por fila (cdr_fila).</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Fila</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Ramal</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Sem registros.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.time_data}</TableCell>
                <TableCell>{r.nome_fila}</TableCell>
                <TableCell>{r.agente}</TableCell>
                <TableCell className="font-mono">{r.ramal}</TableCell>
                <TableCell>
                  <Badge variant={r.evento === "ATENDEU" ? "default" : "secondary"}>{r.evento}</Badge>
                </TableCell>
                <TableCell className="text-xs">{r.motivo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
