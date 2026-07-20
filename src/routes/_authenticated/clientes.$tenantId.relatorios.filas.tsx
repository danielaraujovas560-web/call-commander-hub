import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListOrdered, Headset } from "lucide-react";
import { listCdrFila, downloadGravacao } from "@/lib/ramais.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/report-shell";
import { ReportFilters, type ReportFilterValues } from "@/components/report-filters";
import { reasonOptions, getReasonLabel, eventOptions, getEventLabel} from "@/lib/report-labels";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/filas")({
  head: () => ({ meta: [{ title: "Relatório filas — Painel PABX" }] }),
  component: Page,
});

// clientes.$tenantId.relatorios.filas.tsx

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

  const filaOptions = [
    ...new Map(
     rows.map((r) => [
        r.display_name,
        { value: r.display_name, label: r.display_name },
      ])
    ).values(),
  ];

const fnDownload = useServerFn(downloadGravacao)

const executarDownload = async (id: number) => {
  try {
    const response = await fnDownload({
      data: {
        id: Number(id),
        tipo: "fila",
        tenant_id: tenantId }});

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
        }}
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
        <ListOrdered className="h-6 w-6" /> Relatório — Filas
      </h1>
      <ReportFilters
        onApply={setF}
        fields={[
          { key: "linkedid", label: "Linked ID" },
          { key: "origem", label: "Agente" },
          { key: "fila", label: "Fila", options: filaOptions },
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
                <TableHead className="w-16 text-center pr-4"><Headset className="mx-auto h-4 w-4 text-muted-foreground" /></TableHead>
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
                  <TableCell className="w-14 text-center pr-4">
                    {r.nome_gravacao && r.evento === "AGENTE_ATENDEU" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-0"
                        onClick={() => executarDownload(r.id)}
                        title="Baixar gravação">
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
