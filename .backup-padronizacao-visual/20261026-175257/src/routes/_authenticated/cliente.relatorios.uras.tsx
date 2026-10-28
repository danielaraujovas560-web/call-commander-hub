import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { Workflow, ChevronLeft, ChevronRight, Bot, Phone, FileText } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-role";

import { listCdrUra, getCdrUraExtratoIa } from "@/lib/relatorios.functions";
import { getConfiguracoes } from "@/lib/configuracoes.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportShell } from "@/components/report-shell";
import {
  ReportFilters,
  type ReportFilterValues,
  usePersistentFilter,
} from "@/components/report-filters";
import { formatarDataHora } from "@/lib/utils";
import { useClienteContext } from "./_cliente-context";

type TipoUra = "Normal" | "IA";

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

function formatarCusto(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") {
    return "—";
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) return "—";

  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export const Route = createFileRoute("/_authenticated/cliente/relatorios/uras")({
  head: () => ({
    meta: [{ title: "Relatório URAs — Painel PABX" }],
  }),
  component: Page,
});

function Page() {
  const { tenantId } = useClienteContext();
  const { isAdmin } = useIsAdmin();

  const [tipoUra, setTipoUra] = useState<TipoUra>("Normal");

  const [fUraNormal, setFUraNormal] = usePersistentFilter(
    "fUraNormal",
    tenantId,
    getTodayFilters(),
  );

  const [fUraIA, setFUraIA] = usePersistentFilter("fUraIA", tenantId, getTodayFilters());

  const fUra = tipoUra === "Normal" ? fUraNormal : fUraIA;
  const setFUra = tipoUra === "Normal" ? setFUraNormal : setFUraIA;

  const [page, setPage] = useState(1);

  const [cdrSelecionado, setCdrSelecionado] = useState<number | null>(null);

  const fnExtratoIa = useServerFn(getCdrUraExtratoIa);

  const {
    data: extratoIa,
    isLoading: carregandoExtrato,
    error: erroExtrato,
  } = useQuery({
    queryKey: ["cdr_ura_extrato_ia", tenantId, cdrSelecionado],
    queryFn: () =>
      fnExtratoIa({
        data: {
          tenant_id: tenantId,
          cdrId: cdrSelecionado!,
        },
      }),
    enabled: !!tenantId && cdrSelecionado !== null,
  });

  const { data: configuracoes } = useQuery({
    queryKey: ["configuracoes", tenantId, "modulos.ia"],
    queryFn: () =>
      getConfiguracoes({
        data: {
          chaves: ["modulos.ia"],
        },
      }),
    enabled: !!tenantId,
  });

  const iaEnabled =
    configuracoes?.some((config) => config.chave === "modulos.ia" && config.valor === "true") ??
    false;

  useEffect(() => {
    if (!iaEnabled && tipoUra === "IA") {
      setTipoUra("Normal");
    }
  }, [iaEnabled, tipoUra]);

  const fn = useServerFn(listCdrUra);

  const {
    data: uraData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["cdr_ura", tenantId, tipoUra, page, fUra],
    queryFn: () =>
      fn({
        data: {
          tenant_id: tenantId,
          page,
          ...fUra,
          tipo: tipoUra,
        },
      }),
    enabled: !!tenantId,
  });

  const rowsUra = useMemo(() => {
    if (Array.isArray(uraData?.rows)) return uraData.rows;
    if (Array.isArray(uraData?.data)) return uraData.data;
    if (Array.isArray(uraData)) return uraData;
    return [];
  }, [uraData]);

  const uraName = [
    ...new Map(
      rowsUra.map((r: any) => [r.nome_ura, { value: r.nome_ura, label: r.nome_ura }]),
    ).values(),
  ];

  const uraOptions = [
    ...new Map(
      rowsUra.map((r: any) => [r.opcao, { value: r.opcao, label: String(r.opcao) }]),
    ).values(),
  ].sort(
    (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0) || a.label.localeCompare(b.label),
  );

  const totalPages = uraData?.totalPages ?? 1;

  function mudarTipo(tipo: TipoUra) {
    setTipoUra(tipo);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Workflow className="h-6 w-6" />
        Relatório — URAs
      </h1>

      <Tabs value={tipoUra} onValueChange={(value) => mudarTipo(value as TipoUra)}>
        <TabsList className={`grid w-fit ${iaEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
          <TabsTrigger value="Normal" className="gap-2">
            <Phone className="h-4 w-4" />
            URA Normal
          </TabsTrigger>

          {iaEnabled && (
            <TabsTrigger value="IA" className="gap-2">
              <Bot className="h-4 w-4" />
              URA com IA
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <ReportFilters
        storageKey={tipoUra === "Normal" ? "fUraNormal" : "fUraIA"}
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
          { key: "destino", label: "Opção", options: uraOptions },
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

                {tipoUra === "IA" && <TableHead className="text-right">Custo de IA</TableHead>}

                {tipoUra === "IA" && <TableHead>Detalhamento</TableHead>}
                <TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rowsUra.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.linkedid}</TableCell>

                  <TableCell>{r.num_did}</TableCell>

                  <TableCell className="font-mono">{r.nome_ura}</TableCell>

                  <TableCell className="font-mono">{r.opcao ?? "—"}</TableCell>

                  <TableCell>
                    {r.dest_op} → {r.destino_nome}
                  </TableCell>

                  {tipoUra === "IA" && (
                    <TableCell className="text-right font-mono">
                      {formatarCusto(r.custo_ia_brl)}
                    </TableCell>
                  )}
                  {tipoUra === "IA" && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCdrSelecionado(Number(r.id))}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Extrato
                      </Button>
                    </TableCell>
                  )}
                  <TableCell>{formatarDataHora(r.date_time)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportShell>

        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
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
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>

            <span className="text-sm">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <Dialog
            open={cdrSelecionado !== null}
            onOpenChange={(open) => {
              if (!open) setCdrSelecionado(null);
            }}
          >
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Extrato de consumo de IA</DialogTitle>
                <DialogDescription>
                  Detalhamento dos consumos registrados para esta passagem pela URA.
                </DialogDescription>
              </DialogHeader>

              {carregandoExtrato ? (
                <p className="py-6 text-sm text-muted-foreground">Carregando extrato...</p>
              ) : erroExtrato ? (
                <p className="py-6 text-sm text-destructive">
                  Não foi possível carregar o extrato de IA.
                </p>
              ) : extratoIa ? (
                <div className="space-y-5">
                  <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">URA</p>
                      <p className="font-medium">{extratoIa.cdr.nome_ura}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <p className="font-medium">{extratoIa.cdr.tipo}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Custo total registrado</p>
                      <p className="font-semibold">{formatarCusto(extratoIa.cdr.custo_ia_brl)}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Eventos encontrados</p>
                      <p className="font-medium">{extratoIa.total_eventos}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 font-semibold">Eventos de consumo</h3>

                    {extratoIa.eventos.length === 0 ? (
                      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                        Nenhum evento de consumo de IA foi encontrado para este registro.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/Hora</TableHead>
                              <TableHead>Componente</TableHead>
                              <TableHead>Provedor</TableHead>
                              <TableHead>Modelo</TableHead>
                              <TableHead className="text-right">Tokens entrada</TableHead>
                              <TableHead className="text-right">Tokens saída</TableHead>
                              <TableHead className="text-right">Caracteres</TableHead>
                              {isAdmin && <TableHead className="text-right">Custo USD</TableHead>}
                              <TableHead className="text-right">Custo BRL</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {extratoIa.eventos.map((evento) => (
                              <TableRow key={evento.evento_id}>
                                <TableCell className="whitespace-nowrap">
                                  {formatarDataHora(evento.criado_em)}
                                </TableCell>

                                <TableCell>{evento.componente}</TableCell>
                                <TableCell>{evento.provedor}</TableCell>
                                <TableCell className="max-w-48 break-all">
                                  {evento.modelo ?? "—"}
                                </TableCell>

                                <TableCell className="text-right">
                                  {evento.tokens_entrada ?? "—"}
                                </TableCell>

                                <TableCell className="text-right">
                                  {evento.tokens_saida ?? "—"}
                                </TableCell>

                                <TableCell className="text-right">
                                  {evento.caracteres_cobrados ?? "—"}
                                </TableCell>

                                {isAdmin && (
                                  <TableCell className="whitespace-nowrap text-right">
                                    {evento.custo_usd == null
                                      ? "—"
                                      : `${Number(evento.custo_usd).toLocaleString("pt-BR", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 8,
                                        })} USD`}
                                  </TableCell>
                                )}

                                <TableCell className="whitespace-nowrap text-right">
                                  {formatarCusto(evento.custo_brl)}
                                </TableCell>

                                <TableCell>{evento.status}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
