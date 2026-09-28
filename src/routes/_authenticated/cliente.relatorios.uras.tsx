import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Workflow, ChevronLeft, ChevronRight } from "lucide-react";
import { listCdrUra } from "@/lib/relatorios.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReportShell } from "@/components/report-shell";
import {
  ReportFilters,
  type ReportFilterValues,
  usePersistentFilter,
} from "@/components/report-filters";
import { formatarDataHora } from "@/lib/utils";
import { useClienteContext } from "./_cliente-context";

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
    to: `${todayStr}T${hours}:${minutes}`,
  };
}

export const Route = createFileRoute("/_authenticated/cliente/relatorios/uras")({
  head: () => ({ meta: [{ title: "Relatório URAs — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId, cliente } = useClienteContext();
  const [fUra, setFUra] = usePersistentFilter("fUra", tenantId, getTodayFilters());
  const [page, setPage] = useState(1);
  const fn = useServerFn(listCdrUra);
  const {
    data: uraData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["cdr_ura", tenantId, page, fUra],
    queryFn: () => fn({ data: { tenant_id: tenantId, page, ...fUra } }),
    enabled: !!tenantId,
  });
  const rowsUra = useMemo(() => {
    if (Array.isArray(uraData?.rows)) return uraData.rows;
    if (Array.isArray(uraData?.data)) return uraData.data;
    if (Array.isArray(uraData)) return uraData;
    return [];
  }, [uraData]);

  const uraName = [
    ...new Map(rowsUra.map((r) => [r.nome_ura, { value: r.nome_ura, label: r.nome_ura }])).values(),
  ];

  const uraOptions = [
    ...new Map(rowsUra.map((r) => [r.opcao, { value: r.opcao, label: r.opcao }])).values(),
  ].sort((a, b) => {
    return (Number(a.value) || 0) - (Number(b.value) || 0) || a.label.localeCompare(b.label);
  });

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
        onApply={(valores) => {
          setPage(1);
          setFUra({ ...getTodayFilters(), ...valores });
        }}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "DID (origem)" },
          { key: "status", label: "Nome URA", options: uraName },
          { key: "destino", label: "Opção digitada", options: uraOptions },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell
          loading={isLoading}
          error={error as Error | null}
          empty={!isLoading && rowsUra.length === 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linked ID</TableHead>
                <TableHead>DID</TableHead>
                <TableHead>URA</TableHead>
                <TableHead>Opção</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsUra.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell>{r.num_did}</TableCell>
                  <TableCell className="font-mono">{r.nome_ura}</TableCell>
                  <TableCell className="font-mono">{r.opcao}</TableCell>
                  <TableCell>
                    {r.dest_op} → {r.destino_nome}
                  </TableCell>
                  <TableCell>{formatarDataHora(r.date_time)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
        <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
          <span className="text-sm text-muted-foreground">
            Total de registros: <strong>{uraData?.total ?? rowsUra.length}</strong>
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>

            <span className="text-sm">
              Página <strong>{page}</strong> de <strong>{uraData?.totalPages ?? 1}</strong>
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= (uraData?.totalPages ?? 1) || isLoading}
              onClick={() => setPage((p) => Math.min(uraData?.totalPages ?? 1, p + 1))}
            >
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
