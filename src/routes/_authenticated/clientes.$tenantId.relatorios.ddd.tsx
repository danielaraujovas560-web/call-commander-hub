import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { listCdrCidadesEntrada, listCdrCidadesSaida } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/ddd")({
  head: () => ({ meta: [{ title: "Relatório por DDD — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [fEnt, setFEnt] = useState<ReportFilterValues>({});
  const [fSai, setFSai] = useState<ReportFilterValues>({});
  const entFn = useServerFn(listCdrCidadesEntrada);
  const saiFn = useServerFn(listCdrCidadesSaida);
  const ent = useQuery({ queryKey: ["cdr_cidades_entrada", tenantId, fEnt], queryFn: () => entFn({ data: { tenant_id: tenantId, ...fEnt } }) });
  const sai = useQuery({ queryKey: ["cdr_cidades_saida", tenantId, fSai], queryFn: () => saiFn({ data: { tenant_id: tenantId, ...fSai } }) });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <MapPin className="h-6 w-6" /> Relatório — Por DDD
      </h1>
      <div className="grid gap-6 md:grid-cols-2">
        <TableSection title="Entrada" rows={ent.data?.rows ?? []} loading={ent.isLoading} error={ent.error as Error | null} onFilter={setFEnt} />
        <TableSection title="Saída"  rows={sai.data?.rows ?? []} loading={sai.isLoading} error={sai.error as Error | null} onFilter={setFSai} />
      </div>
    </div>
  );
}

function TableSection({ title, rows, loading, error, onFilter }: any) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{title}</h3>
      <ReportFilters
        onApply={onFilter}
        fields={[
          { key: "origem", label: "Número" },
          { key: "status", label: "UF", placeholder: "ES, SP…" },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={loading} error={error} empty={!loading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e Hora</TableHead><TableHead>DDD</TableHead><TableHead>Número</TableHead><TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.data_hora ?? "-"}</TableCell>
                  <TableCell className="font-mono">{r.ddd || "-"}</TableCell>
                  <TableCell className="font-mono">{r.numero}</TableCell>
                  <TableCell>{r.estado || r.sigla_estado || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
      </div>
    </div>
  );
}
