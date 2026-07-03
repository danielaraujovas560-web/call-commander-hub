import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { listCdrPesquisa } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/pesquisa")({
  head: () => ({ meta: [{ title: "Pesquisa de satisfação — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listCdrPesquisa);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_pesquisa", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Star className="h-6 w-6" /> Relatório — Pesquisa de satisfação
      </h1>
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Fila</TableHead>
                <TableHead>Agente</TableHead><TableHead>Ramal</TableHead>
                <TableHead>Pergunta</TableHead><TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.data}</TableCell>
                  <TableCell className="font-mono">{r.numero_origem}</TableCell>
                  <TableCell>{r.nome_fila}</TableCell>
                  <TableCell>{r.agente}</TableCell>
                  <TableCell className="font-mono">{r.ramal}</TableCell>
                  <TableCell>#{r.pergunta_id}</TableCell>
                  <TableCell><Badge>{r.nota}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
