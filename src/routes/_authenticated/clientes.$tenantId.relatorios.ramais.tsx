import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import { listCdrRamal } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/ramais")({
  head: () => ({ meta: [{ title: "Relatório ramais — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listCdrRamal);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_ramal", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <PhoneCall className="h-6 w-6" /> Relatório — Ramais
      </h1>
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
                <TableHead>Tronco</TableHead><TableHead>Contexto</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Duração</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.date_time}</TableCell>
                  <TableCell className="font-mono">{r.origem}</TableCell>
                  <TableCell className="font-mono">{r.destino}</TableCell>
                  <TableCell>{r.tronco || "-"}</TableCell>
                  <TableCell>{r.context}</TableCell>
                  <TableCell>{r.tipo_chamada}</TableCell>
                  <TableCell className="font-mono">{r.duracao}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
