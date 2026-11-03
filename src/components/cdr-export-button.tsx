import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { iniciarExportacaoCdr, progressoExportacaoCdr } from "@/lib/cdr-export.functions";
import type { ReportFilterValues } from "@/components/report-filters";

type Props = { tenantId?: number | null; filters: ReportFilterValues; tipo: string };
const formatter = new Intl.NumberFormat("pt-BR");
type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CdrExportButton({ tenantId, filters, tipo }: Props) {
  const [open, setOpen] = useState(false);
  const [formato, setFormato] = useState<"csv" | "xlsx">("xlsx");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const iniciar = useServerFn(iniciarExportacaoCdr);
  const progresso = useServerFn(progressoExportacaoCdr);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function exportar() {
    if (!tenantId || busyRef.current) return;
    const from = String(filters.from || "");
    const to = String(filters.to || "");
    if (!from || !to) {
      toast.error("Informe as datas inicial e final.");
      return;
    }

    const inicio = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
    const fim = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);

    const dias = Math.round((fim - inicio) / 86400000) + 1;

    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || inicio > fim) {
      toast.error("Informe um período de datas válido.");
      return;
    }

    if (dias > 31) {
      toast.error("O período máximo permitido é de 31 dias corridos.");
      return;
    }

    // O seletor precisa abrir no clique do usuário, antes de qualquer await de rede.
    const filename = `cdr_${tipo}_${from.slice(0, 10)}_a_${to.slice(0, 10)}.${formato}`;
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    let fileHandle:
      Awaited<ReturnType<NonNullable<SavePickerWindow["showSaveFilePicker"]>>> | undefined;
    if (picker && window.isSecureContext) {
      try {
        fileHandle = await picker({
          suggestedName: filename,
          types: [
            {
              description: formato === "csv" ? "Arquivo CSV" : "Planilha Excel",
              accept:
                formato === "csv"
                  ? { "text/csv": [".csv"] }
                  : {
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                        ".xlsx",
                      ],
                    },
            },
          ],
        });
      } catch (error) {
        // Cancelamento do diálogo não deve iniciar exportação nem mostrar erro.
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("[CDR EXPORT] Seletor indisponível; usando download convencional:", error);
      }
    }

    busyRef.current = true;
    setBusy(true);
    setOpen(false);
    const toastId = toast.loading("Preparando exportação...");
    let polling = true;
    let progressTask: Promise<void> | undefined;
    let totalConfirmado: number | null = null;
    const downloadNativo = !fileHandle;
    let nativeFinished = false;
    let progressError: string | null = null;
    let progressUnavailable = false;
    let consecutiveFailures = 0;

    try {
      const selected: Record<string, string> = {};
      for (const key of [
        "linkedid",
        "origem",
        "destino",
        "status",
        "tipo",
        "contexto",
        "from",
        "to",
        "sigla_estado",
      ] as const) {
        const value = (filters as Record<string, unknown>)[key];
        if (value != null && String(value).trim() !== "") selected[key] = String(value);
      }

      const { jobId, ticket } = await iniciar({
        data: {
          tenant_id: tenantId,
          tipo,
          formato,
          filters: { ...selected, from, to },
        },
      });

      progressTask = (async () => {
        const deadline = Date.now() + 10 * 60 * 1000;
        while (polling && Date.now() < deadline) {
          try {
            const p = await progresso({ data: { tenant_id: tenantId, jobId } });
            if (!polling) break;
            consecutiveFailures = 0;

            if (p.status === "error" || p.status === "cancelled") {
              progressError =
                p.status === "error"
                  ? p.error || "Falha na geração do relatório"
                  : "Exportação cancelada";
              polling = false;
              break;
            }

            const processed = Number(p.processed) || 0;
            const total = Number(p.total) || 0;
            const status = String(p.status);

            if (status === "preparing" || status === "pending" || status === "queued") {
              toast.loading("Consultando registros...", { id: toastId, description: null });
            } else {
              totalConfirmado = total;
              if (total === 0) {
                toast.loading("Preparando arquivo sem registros...", {
                  id: toastId,
                  description: null,
                });
              } else {
                const pct = Math.min(100, Math.floor((processed / total) * 100));
                toast.loading("Exportando relatório...", {
                  id: toastId,
                  description: `${formatter.format(processed)} / ${formatter.format(total)} registros (${pct}%)`,
                });
              }
            }

            if (status === "done") {
              nativeFinished = true;
              polling = false;
              break;
            }
          } catch (error) {
            if (!polling) break;
            consecutiveFailures++;
            console.warn("[CDR EXPORT] Falha ao consultar progresso:", error);
            // O download pode continuar mesmo se a ServerFn falhar no Firefox.
            // Não transformar falha do acompanhamento em falha do arquivo.
            if (consecutiveFailures >= 5) {
              progressUnavailable = true;
              polling = false;
              break;
            }
          }
          if (polling) await sleep(1000);
        }
        if (polling && Date.now() >= deadline) {
          progressUnavailable = true;
          polling = false;
        }
      })();

      const downloadUrl = `/api/cdr-exportar?ticket=${encodeURIComponent(ticket)}`;

      if (downloadNativo) {
        // Firefox/Safari: download nativo sem Blob e sem navegar a aba atual.
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.title = "Download do relatório";
        document.body.appendChild(iframe);
        iframe.src = downloadUrl;
        // A remoção não deve acontecer antes de o navegador assumir o download.
        setTimeout(() => iframe.remove(), 15 * 60 * 1000);

        while (polling && !nativeFinished && !progressUnavailable && !progressError) {
          await sleep(250);
        }
        if (progressError) throw new Error(progressError);
        // Sem confirmação de progresso, o download pode continuar normalmente.
      } else {
        const response = await fetch(downloadUrl, { cache: "no-store" });
        if (!response.ok) {
          let message = `Falha na exportação (HTTP ${response.status})`;
          try {
            const payload = await response.json();
            if (typeof payload?.error === "string") message = payload.error;
          } catch {
            /* A resposta pode não ser JSON. */
          }
          throw new Error(message);
        }
        if (!response.body) throw new Error("O servidor não disponibilizou o streaming do arquivo");

        // Chrome/Edge: grava direto no disco, sem montar um Blob.
        const writable = await fileHandle!.createWritable();
        const writer = writable.getWriter();
        let bytes = 0;
        try {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              await writer.write(value);
            }
          } finally {
            reader.releaseLock();
          }
          if (!bytes) throw new Error("O servidor retornou um arquivo vazio");
          await writer.close();
        } catch (error) {
          await writer.abort().catch(() => {});
          throw error;
        } finally {
          writer.releaseLock();
        }
      }

      polling = false;
      if (progressTask) await progressTask;

      // Um novo toast evita herdar descrições/progresso do toast.loading anterior.
      toast.dismiss(toastId);
      if (totalConfirmado === 0) {
        toast.info(`Relatório ${formato.toUpperCase()} gerado sem registros.`);
      } else if (downloadNativo && progressUnavailable) {
        toast.info("Download iniciado. Acompanhe pelo gerenciador do navegador.");
      } else if (downloadNativo) {
        toast.success(
          `Relatório ${formato.toUpperCase()} gerado. Confira os downloads do navegador.`,
        );
      } else {
        toast.success(`Relatório ${formato.toUpperCase()} exportado com sucesso!`);
      }
    } catch (error) {
      polling = false;
      if (progressTask) await progressTask;
      toast.dismiss(toastId);
      const message =
        error instanceof Error ? error.message : "Falha desconhecida ao exportar relatório.";

      toast.error(message);
      console.error("[CDR EXPORT]", error);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!tenantId || busy}
        onClick={() => setOpen(true)}
      >
        <Download className="mr-2 h-4 w-4" />
        {busy ? "Exportando..." : "Exportar"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar relatório geral</DialogTitle>
            <DialogDescription>
              Exporta todos os registros dos filtros aplicados, sem limite de paginação. Período
              máximo: 31 dias.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-3">
            <button
              type="button"
              onClick={() => setFormato("csv")}
              aria-pressed={formato === "csv"}
              className={`flex items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${formato === "csv" ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}
            >
              <FileText className="h-5 w-5" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setFormato("xlsx")}
              aria-pressed={formato === "xlsx"}
              className={`flex items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${formato === "xlsx" ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}
            >
              <FileSpreadsheet className="h-5 w-5" /> XLSX
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void exportar()}>
              Exportar {formato.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
