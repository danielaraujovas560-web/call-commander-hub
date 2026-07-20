import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PhoneCall, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCdrRamal, downloadGravacao } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";
import { statusOptions, getStatusLabel } from "@/lib/report-labels";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/ramais")({
  head: () => ({ meta: [{ title: "Relatório ramais — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const [f, setF] = useState<ReportFilterValues>({});
  const fn = useServerFn(listCdrRamal);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cdr_ramal", tenantId, f],
    queryFn: () => fn({ data: { tenant_id: tenantId, ...f } }),
  });
  const rows = data?.rows ?? [];

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
        onApply={setF}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "status", label: "Status", options: statusOptions },
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
                <TableHead>Tronco</TableHead><TableHead>Contexto</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Duração</TableHead><TableHead className="w-40">Status</TableHead>
                <TableHead className="w-16 text-center pr-4"><Headset className="mx-auto h-4 w-4 text-muted-foreground" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id} className="h-10">
                  <TableCell className="text-xs">{r.date_time}</TableCell>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>
                  <TableCell className="font-mono">{r.agente}</TableCell>
                  <TableCell className="font-mono">{r.destino}</TableCell>
                  <TableCell>{r.tronco || "-"}</TableCell>
                  <TableCell>{r.context}</TableCell>
                  <TableCell>{r.tipo_chamada}</TableCell>
                  <TableCell className="font-mono">{r.duracao}</TableCell>
                  <TableCell className="w-40"><Badge variant={r.status === "ANSWER" ? "default" : "secondary"}>{getStatusLabel(r.status)}</Badge></TableCell> 
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
      </div>
    </div>
  );
}
