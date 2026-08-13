import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Star, Users, Phone } from "lucide-react";
import { listCdrPesquisa } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, notaColors } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";

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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/pesquisa")({
  head: () => ({ meta: [{ title: "Pesquisa de satisfação — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [fPesquisaRamal, setFPesquisaRamal] = useState<ReportFilterValues>(() => getTodayFilters());
  const [fPesquisaFila, setFPesquisaFila] = useState<ReportFilterValues>(() => getTodayFilters());
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"ramal" | "fila">("ramal");
  const currentFilters = activeTab === "ramal" ? fPesquisaRamal : fPesquisaFila;
  const fn = useServerFn(listCdrPesquisa);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_pesquisa", tenantId, activeTab, currentFilters, page],
    queryFn: () => fn({ data: { tenant_id: tenantId, tipo: activeTab.toUpperCase(), page, ...currentFilters } }),
  });
  const rows = useMemo(() => {
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
  }, [data]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Star className="h-6 w-6" /> Relatório — Pesquisa de satisfação
      </h1>

      <Tabs 
        value={activeTab}
        onValueChange={(val) => {
          setPage(1); // Reseta a página ao trocar de aba
          setActiveTab(val as "ramal" | "fila");
       }}
       className="w-full space-y-4"
      >
        <TabsList>
          <TabsTrigger value="ramal" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Ramal
          </TabsTrigger>
          <TabsTrigger value="fila" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Fila
          </TabsTrigger>
        </TabsList>

    <TabsContent value="ramal" className="w-full space-y-6">
      <ReportFilters
        storageKey="fPesquisaRamal"
        tenantId={tenantId}
        initialValues={fPesquisaRamal}
        defaultValues={getTodayFilters()}
        onApply={(valores) => {
             setPage(1);
             setFPesquisaRamal(valores);}}
        fields={[
          { key: "linkedid", label: "Linkedid" },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Linkedid</TableHead>
                 <TableHead>Origem</TableHead><TableHead>Destino</TableHead>
                <TableHead>Pergunta</TableHead><TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.data}</TableCell>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell className="font-mono">{r.origem}</TableCell>
                  <TableCell>{r.destino}</TableCell>
                  <TableCell>#{r.pergunta_id}</TableCell>
                  <TableCell><Badge className={notaColors[Number(r.nota)]}>{r.nota}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
         </ReportShell>
        </div>
       </TabsContent>
    <TabsContent value="fila" className="w-full space-y-6">
      <ReportFilters
        storageKey="fPesquisaFila"
        tenantId={tenantId}
        initialValues={fPesquisaFila}
        defaultValues={getTodayFilters()}
        onApply={(valores) => {
             setPage(1);
             setFPesquisaFila(valores);}}
        fields={[
          { key: "linkedid", label: "Linkedid" },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "status", label: "Fila" },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Linkedid</TableHead>
                 <TableHead>Origem</TableHead><TableHead>Destino</TableHead><TableHead>Fila</TableHead>
                <TableHead>Pergunta</TableHead><TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.data}</TableCell>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell className="font-mono">{r.origem}</TableCell>
                  <TableCell>{r.destino}</TableCell>
                  <TableCell>{r.fila}</TableCell>
                  <TableCell>#{r.pergunta_id}</TableCell>
                  <TableCell><Badge className={notaColors[Number(r.nota)]}>{r.nota}</Badge></TableCell>
                </TableRow>
              ))}
           </TableBody>
         </Table>
        </ReportShell>
       </div>
      </TabsContent>
     </Tabs> 
    </div>
  );
}
