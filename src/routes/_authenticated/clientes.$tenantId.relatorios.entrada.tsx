import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PhoneIncoming } from "lucide-react";
import { listCdrEntrada } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/entrada")({
  head: () => ({ meta: [{ title: "Relatório entrada — Painel PABX" }] }),
  component: EntradaPage,
});

function EntradaPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [f, setF] = useState<ReportFilterValues>({});
  const fn = useServerFn(listCdrEntrada);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_entrada", tenantId, f],
    queryFn: () => fn({ data: { tenant_id: tenantId, ...f } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <PhoneIncoming className="h-6 w-6" /> Relatório — Entrada geral
      </h1>
      <ReportFilters
        onApply={setF}
        fields={[
          { key: "linkedid", label: "Linked ID", placeholder: "1782..." },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "status", label: "Status", options: ["ANSWER", "NO ANSWER", "BUSY", "FAILED", "CANCEL"] },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Linked ID</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
                <TableHead>Dest. interno</TableHead><TableHead>Duração</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.date_time}</TableCell>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell className="font-mono">{r.origem}</TableCell>
                  <TableCell className="font-mono">{r.num_destino}</TableCell>
                  <TableCell>{r.dest_interno || "-"}</TableCell>
                  <TableCell className="font-mono">{r.duracao}</TableCell>
                  <TableCell><Badge variant={r.status === "ANSWER" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
