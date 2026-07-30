import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Workflow } from "lucide-react";
import { listCdrUra } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues, usePersistentFilter } from "@/components/report-filters";
import { formatarDataHora } from "@/lib/utils";

function getTodayFilters(): ReportFilterValues {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  return {
    from: `${todayStr}T00:00`,
    to: `${todayStr}T${hours}:${minutes}`
  };
}

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/uras")({
  head: () => ({ meta: [{ title: "Relatório URAs — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [fUra, setFUra] = usePersistentFilter("fUra", tenantId, getTodayFilters());
  const [page, setPage] = useState(1);
  const fn = useServerFn(listCdrUra);
  const { data: uraData, isLoading, error } = useQuery({
    queryKey: ["cdr_ura", tenantId, page, fUra],
    queryFn: () => fn({ data: { tenant_id: tenantId, page, ...fUra } }),
  });
  const rowsUra = useMemo(() => {
    if (Array.isArray(uraData?.rows)) return uraData.rows;
    if (Array.isArray(uraData?.data)) return uraData.data;
    if (Array.isArray(uraData)) return uraData;
    return [];
  }, [uraData]);

  const uraOptions = [
    ...new Map(
     rowsUra.map((r) => [
        r.display_name,
        { value: r.nome, label: r.nome },
      ])
    ).values(),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Workflow className="h-6 w-6" /> Relatório — URAs
      </h1>
      <ReportFilters
        storageKey="fUra"
        tenantId={tenantId}
        initialValues={fUra}
        defaultValues={getTodayFilters()}
        onApply={(valores) => setFUra({ ...getTodayFilters(), ...valores })}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "DID (origem)" },
          { key: "status", label: "Nome URA", options: uraOptions },
          { key: "destino", label: "Opção digitada" },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" }
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rowsUra.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linked ID</TableHead><TableHead>DID</TableHead><TableHead>URA</TableHead><TableHead>Opção</TableHead>
                <TableHead>Destino</TableHead><TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsUra.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell>{r.num_did}</TableCell>
                  <TableCell className="font-mono">{r.nome}</TableCell>
                  <TableCell className="font-mono">{r.opcao}</TableCell>
                  <TableCell>{r.dest_op} → {r.destino_nome}</TableCell>
                  <TableCell>{formatarDataHora(r.date_time)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
