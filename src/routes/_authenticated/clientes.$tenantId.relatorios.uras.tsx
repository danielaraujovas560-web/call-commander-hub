import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Workflow } from "lucide-react";
import { listCdrUra } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/uras")({
  head: () => ({ meta: [{ title: "Relatório URAs — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [f, setF] = useState<ReportFilterValues>({});
  const fn = useServerFn(listCdrUra);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_ura", tenantId, f],
    queryFn: () => fn({ data: { tenant_id: tenantId, ...f } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Workflow className="h-6 w-6" /> Relatório — URAs
      </h1>
      <ReportFilters
        onApply={setF}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "DID (origem)" },
          { key: "destino", label: "Destino (dest_op)" },
          { key: "status", label: "Nome URA" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linked ID</TableHead><TableHead>URA</TableHead><TableHead>DID</TableHead><TableHead>Opção</TableHead>
                <TableHead>Destino</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell className="font-mono">{r.num_did}</TableCell>
                  <TableCell className="font-mono">{r.opcao}</TableCell>
                  <TableCell>{r.dest_op} → {r.destino_nome}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
