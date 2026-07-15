import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListOrdered } from "lucide-react";
import { listCdrFila } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";
import { reasonOptions, getReasonLabel, eventOptions, getEventLabel} from "@/lib/report-labels";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/filas")({
  head: () => ({ meta: [{ title: "Relatório filas — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [f, setF] = useState<ReportFilterValues>({});
  const fn = useServerFn(listCdrFila);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_fila", tenantId, f],
    queryFn: () => fn({ data: { tenant_id: tenantId, ...f } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ListOrdered className="h-6 w-6" /> Relatório — Filas
      </h1>
      <ReportFilters
        onApply={setF}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "Agente" },
          { key: "status", label: "Evento", options: eventOptions },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Linked ID</TableHead><TableHead>Fila</TableHead><TableHead>Agente</TableHead>
                <TableHead>Evento</TableHead><TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.time_data}</TableCell>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell>{r.display_name}</TableCell>
                  <TableCell>{r.agente}</TableCell>
                  <TableCell>
                    <Badge variant={r.evento === "AGENTE_ATENDEU" ? "default" : "secondary"}>{getEventLabel(r.evento)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{getReasonLabel(r.motivo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
