import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Workflow, RefreshCw } from "lucide-react";
import { listCdrUra } from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/uras")({
  head: () => ({ meta: [{ title: "URAs — Cliente — Painel PABX" }] }),
  component: UrasPage,
});

function UrasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listCdrUra);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["cdr_ura", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6" /> URAs
          </h1>
          <p className="text-sm text-muted-foreground">Eventos das URAs (cdr_ura).</p>
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
              <TableHead>URA</TableHead>
              <TableHead>DID</TableHead>
              <TableHead>Opção</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Linked ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Sem registros.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.nome_ura}</TableCell>
                <TableCell className="font-mono">{r.num_did}</TableCell>
                <TableCell className="font-mono">{r.opcao}</TableCell>
                <TableCell>{r.dest_op} → {r.dest_nome}</TableCell>
                <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
