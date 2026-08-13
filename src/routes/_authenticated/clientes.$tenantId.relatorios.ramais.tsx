import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PhoneCall, Headset, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCdrRamal, downloadGravacao } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";
import { statusOptions, getStatusLabel, tipoOptions, contextOptions } from "@/lib/report-labels";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/ramais")({
  head: () => ({ meta: [{ title: "Relatório ramais — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [fRamais, setFRamais] = useState<ReportFilterValues>(() => ({ ...getTodayFilters(), limit: 25 }));
  const [page, setPage] = useState(1); 
  const fn = useServerFn(listCdrRamal);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_ramal", tenantId, page, fRamais],
    queryFn: () => fn({ data: { tenant_id: tenantId, page, ...fRamais } }),
  });
  const rows = useMemo(() => {
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
  }, [data]);

const fnDownload = useServerFn(downloadGravacao);

const executarDownload = async (id: number) => {
  try {
    const response = await fnDownload({ 
      data: { 
        id: Number(id),
        tipo: "ramal",
        tenant_id: tenantId 
      } 
    });

    let nomeArquivo = `call-${id}.wav`;
    let blob: Blob;

    if (response instanceof Response) {
      blob = await response.blob();
      
      // Tenta extrair o nome do arquivo de dentro do "attachment; filename="nome_real.wav""
      const disposition = response.headers.get("content-disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          nomeArquivo = match[1];
        }
      }
    } else {
      blob = new Blob([response as any], { type: "audio/wav" });
    }

    // Executa o download com o nome real dinâmico
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    console.error("Erro ao baixar gravação:", err);
    alert("Não foi possível baixar o áudio.");
  }
};
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <PhoneCall className="h-6 w-6" /> Relatório — Ramais
      </h1>
      <ReportFilters
        storageKey="fRamais"
        tenantId={tenantId}
        initialValues={fRamais}
        defaultValues={getTodayFilters()}
        onApply={(valores) => {
             setPage(1); 
             setFRamais(valores);}}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "status", label: "Status", options: statusOptions },
          { key: "tipo", label: "Tipo", options: tipoOptions },
          { key: "contexto", label: "Contexto", options: contextOptions },
          { key: "from", label: "De", type: "datetime-local" },
          { key: "to", label: "Até", type: "datetime-local" },
        ]}
      />
      <div className="rounded-md border bg-card">
        <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linked ID</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
                <TableHead>Tronco</TableHead><TableHead>Contexto</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Duração</TableHead><TableHead className="w-40">Status</TableHead><TableHead>Data/Hora</TableHead>
                <TableHead className="w-16 text-center pr-4"><Headset className="mx-auto h-4 w-4 text-muted-foreground" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id} className="h-10">
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell className="font-mono">{r.agente}</TableCell>
                  <TableCell className="font-mono">{r.destino}</TableCell>
                  <TableCell>{r.tronco || "-"}</TableCell>
                  <TableCell>{r.context}</TableCell>
                  <TableCell>{r.tipo_chamada}</TableCell>
                  <TableCell className="font-mono">{r.duracao}</TableCell>
                  <TableCell className="w-40"><Badge variant={r.status === "ANSWER" ? "default" : "secondary"}>{getStatusLabel(r.status)}</Badge></TableCell> 
                  <TableCell className="text-xs">{formatarDataHora(r.date_time)}</TableCell>
                  <TableCell className="w-14 text-center pr-4">
                    {r.nome_gravacao && r.status === "ANSWER" ? (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 p-0" 
                        onClick={() => executarDownload(r.id)} 
                        title="Baixar gravação"
                      >
                        <Headset className="h-4 w-4" />
                      </Button>
                    ): null}
                  </TableCell>
               </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>
        <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
            <span className="text-sm text-muted-foreground">
            Total de registros: <strong>{data?.total ?? rows.length}</strong>
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
               Página <strong>{page}</strong> de{" "}
              <strong>{data?.totalPages ?? 1}</strong>
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= (data?.totalPages ?? 1) || isLoading}
              onClick={() => setPage((p) => Math.min(data?.totalPages ?? 1, p + 1))}
            >
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
