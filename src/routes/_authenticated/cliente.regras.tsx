import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  ListFilter,
  Route as RouteIcon,
  Cable,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  Copy,
} from "lucide-react";

import {
  listRegras,
  createRegras,
  updateRegras,
  deleteRegras,
  deleteRegrasLote,
  createRegrasPredefinidas,
  type Regra as RegraApi,
} from "@/lib/regras.functions";

import { listTroncos, type Tronco } from "@/lib/troncos.functions";

import { SimuladorRegra, type Regra, type Modelo } from "@/components/simulador-regra";

import { useClienteContext } from "./_cliente-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/cliente/regras")({
  head: () => ({
    meta: [{ title: "Regras — Cliente — Painel PABX" }],
  }),
  component: RouteComponent,
});

type FormRegra = {
  regra_nome: string;
  tipo_ligacao: Regra["tipo_ligacao"];
  codigo_csp: string;
  expressao: string;
  expressao_transformada: string;
  prioridade: number;
};

const formularioVazio: FormRegra = {
  regra_nome: "",
  tipo_ligacao: "movel",
  codigo_csp: "",
  expressao: "",
  expressao_transformada: "",
  prioridade: 1,
};

function RouteComponent() {
  const { tenantId, isLoading: carregandoCliente } = useClienteContext();

  const queryClient = useQueryClient();

  const listarRegrasFn = useServerFn(listRegras);
  const listarTroncosFn = useServerFn(listTroncos);
  const criarRegraFn = useServerFn(createRegras);
  const editarRegraFn = useServerFn(updateRegras);
  const excluirRegraFn = useServerFn(deleteRegras);
  const criarRegrasPredefinidasFn = useServerFn(createRegrasPredefinidas);
  const deleteLote = useServerFn(deleteRegrasLote);

  const [troncoSelecionado, setTroncoSelecionado] = useState("");
  const [modelo, setModelo] = useState<Modelo>("STFC");

  const [dialogAberto, setDialogAberto] = useState(false);
  const [regraEditando, setRegraEditando] = useState<Regra | null>(null);
  const [regraCopiando, setRegraCopiando] = useState<Regra | null>(null);
  const [form, setForm] = useState<FormRegra>(formularioVazio);
  const [salvando, setSalvando] = useState(false);
  const [criandoPredefinidas, setCriandoPredefinidas] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [erroFormulario, setErroFormulario] = useState("");
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const {
    data: dadosRegras,
    isLoading: carregandoRegras,
    isFetching: atualizandoRegras,
    error: erroRegras,
    refetch: recarregarRegras,
  } = useQuery({
    queryKey: ["regras", tenantId],
    queryFn: () =>
      listarRegrasFn({
        data: { tenant_id: tenantId },
      }),
    enabled: !!tenantId,
  });

  const {
    data: dadosTroncos,
    isLoading: carregandoTroncos,
    error: erroTroncos,
  } = useQuery({
    queryKey: ["troncos", tenantId, 0],
    queryFn: () =>
      listarTroncosFn({
        data: {
          tenant_id: tenantId,
          roteamento_simplificado: 0,
        },
      }),
    enabled: !!tenantId,
  });

  const troncos: Tronco[] = dadosTroncos?.troncos ?? [];

  const regrasRecebidas: Regra[] = (dadosRegras?.regras ?? []).map(
    (
      regra: RegraApi & {
        regra_nome?: string;
        tronco_nome?: string;
        nome?: string;
      },
    ) => ({
      id: regra.id,
      tronco_identifier: regra.tronco_identifier,
      tronco_nome: regra.tronco_nome ?? "",
      regra_nome: regra.regra_nome ?? regra.nome ?? "",
      tipo: regra.tipo as Modelo,
      tipo_ligacao: regra.tipo_ligacao,
      codigo_csp: regra.codigo_csp ?? null,
      expressao: regra.expressao,
      expressao_transformada: regra.expressao_transformada,
      prioridade: regra.prioridade,
    }),
  );

  const primeiroTronco = troncos[0]?.tronco_pjsip ?? "";

  const troncoSelecionadoValido = troncos.some(
    (tronco) => tronco.tronco_pjsip === troncoSelecionado,
  );

  const troncoValue = troncoSelecionadoValido ? troncoSelecionado : primeiroTronco;

  const troncoAtual = troncos.find((tronco) => tronco.tronco_pjsip === troncoValue);

  const deleteLoteMutation = useMutation({
    mutationFn: ({
      regras_ids,
      tronco_identifier,
      tipo,
    }: {
      regras_ids: number[];
      tronco_identifier: string;
      tipo: string;
    }) =>
      deleteLote({
        data: {
          tenant_id: tenantId!,
          regras_ids,
          tronco_identifier,
          tipo,
        },
      }),
    onSuccess: () => {
      toast.success(
        `${selecionados.length} ${
          selecionados.length === 1 ? "regra removido" : "regras removidos"
        } com sucesso.`,
      );

      queryClient.invalidateQueries({
        queryKey: ["regras", tenantId],
      });

      setSelecionados([]);
      setModoSelecao(false);
      setConfirmarExclusao(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (!troncoAtual) return;

    const tipoTronco = troncoAtual.tipo;

    if (tipoTronco === "STFC" || tipoTronco === "E164") {
      setModelo(tipoTronco);
    }
  }, [troncoAtual?.tronco_pjsip, troncoAtual?.tipo]);

  const carregando = carregandoCliente || carregandoRegras || carregandoTroncos;

  const erro = erroRegras || erroTroncos;

  const regrasFiltradas = useMemo(
    () =>
      regrasRecebidas
        .filter((regra) => regra.tronco_identifier === troncoValue && regra.tipo === modelo)
        .sort((a, b) => a.prioridade - b.prioridade),
    [regrasRecebidas, troncoValue, modelo],
  );

  function abrirNovaRegra(tipo: Modelo) {
    setRegraEditando(null);
    setForm({ ...formularioVazio });
    setErroFormulario("");
    setModelo(tipo);
    setDialogAberto(true);
    setRegraCopiando(null);
  }

  function duplicarRegra(regra: Regra) {
    setRegraEditando(null);
    setRegraCopiando(regra);

    setForm({
      regra_nome: `${regra.regra_nome} (Cópia)`,
      tipo_ligacao: regra.tipo_ligacao,
      codigo_csp: regra.codigo_csp ?? "",
      expressao: regra.expressao,
      expressao_transformada: regra.expressao_transformada,
      prioridade: regra.prioridade,
    });

    setModelo(regra.tipo);
    setErroFormulario("");
    setDialogAberto(true);
  }

  function abrirEdicao(regra: Regra) {
    setRegraEditando(regra);
    setForm({
      regra_nome: regra.regra_nome,
      tipo_ligacao: regra.tipo_ligacao,
      codigo_csp: regra.codigo_csp ?? "",
      expressao: regra.expressao,
      expressao_transformada: regra.expressao_transformada,
      prioridade: regra.prioridade,
    });
    setErroFormulario("");
    setDialogAberto(true);
    setRegraCopiando(null);
  }

  async function criarRegrasPredefinidas(tipo: Modelo) {
    if (!tenantId || !troncoValue || criandoPredefinidas) return;

    const confirmado = window.confirm(
      `Deseja criar as regras predefinidas ${tipo} para o tronco "${troncoAtual?.nome ?? troncoValue}"?`,
    );

    if (!confirmado) return;

    setCriandoPredefinidas(true);

    try {
      const resultado = await criarRegrasPredefinidasFn({
        data: {
          tenant_id: tenantId,
          tronco_identifier: troncoValue,
          tipo,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: ["regras", tenantId],
      });

      window.alert(`${resultado.total} regras predefinidas ${tipo} criadas com sucesso!`);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Não foi possível criar as regras predefinidas.",
      );
    } finally {
      setCriandoPredefinidas(false);
    }
  }

  async function salvarRegra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenantId) {
      setErroFormulario("Não foi possível identificar o tenant.");
      return;
    }

    if (!regraEditando && !troncoValue) {
      setErroFormulario("Selecione um tronco antes de criar a regra.");
      return;
    }

    if (
      !form.regra_nome.trim() ||
      !form.expressao.trim() ||
      !form.expressao_transformada.trim() ||
      !Number.isInteger(form.prioridade) ||
      form.prioridade < 0
    ) {
      setErroFormulario(
        "Preencha os campos obrigatórios. A prioridade deve ser um inteiro não negativo.",
      );
      return;
    }

    setSalvando(true);
    setErroFormulario("");

    try {
      // Na edição, o tronco permanece o da regra original.
      const identificadorTronco =
        regraEditando?.tronco_identifier ?? regraCopiando?.tronco_identifier ?? troncoValue;

      const nomeTronco =
        regraEditando?.tronco_nome ||
        regraCopiando?.tronco_nome ||
        troncos.find((tronco) => tronco.tronco_pjsip === identificadorTronco)?.nome ||
        "";

      const payload = {
        tenant_id: tenantId,
        tronco_identifier: identificadorTronco,
        tronco_nome: nomeTronco,
        regra_nome: form.regra_nome.trim(),
        tipo: regraEditando?.tipo ?? regraCopiando?.tipo ?? modelo,
        tipo_ligacao: form.tipo_ligacao,
        codigo_csp: form.codigo_csp.trim() || undefined,
        expressao: form.expressao.trim(),
        expressao_transformada: form.expressao_transformada.trim(),
        prioridade: form.prioridade,
      };

      if (regraEditando) {
        await editarRegraFn({
          data: {
            id: regraEditando.id,
            ...payload,
          },
        });
      } else {
        await criarRegraFn({
          data: payload,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["regras", tenantId],
      });

      setDialogAberto(false);
      setRegraEditando(null);
      setRegraCopiando(null);
    } catch (error) {
      setErroFormulario(
        error instanceof Error ? error.message : "Não foi possível salvar a regra.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRegra(regra: Regra) {
    if (!tenantId || excluindoId !== null) return;

    const confirmado = window.confirm(
      `Deseja excluir a regra "${regra.regra_nome}"? Esta ação não pode ser desfeita.`,
    );

    if (!confirmado) return;

    setExcluindoId(regra.id);

    try {
      await excluirRegraFn({
        data: {
          id: regra.id,
          tenant_id: tenantId,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: ["regras", tenantId],
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir a regra.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <RouteIcon className="size-6" />
            Regras de roteamento
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Consulte, configure e teste as regras de discagem dos troncos.
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => recarregarRegras()}
          disabled={atualizandoRegras || !tenantId}
          aria-label="Atualizar regras"
        >
          <RefreshCw className={atualizandoRegras ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(erro as Error).message || "Não foi possível carregar as regras ou os troncos."}
        </div>
      )}

      <Tabs value={modelo} onValueChange={(value) => setModelo(value as Modelo)} className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full space-y-2 sm:max-w-xs">
            <Label htmlFor="seletor-tronco">Tronco</Label>

            <SelectTronco
              troncos={troncos}
              troncoValue={troncoValue}
              carregando={carregandoTroncos}
              onChange={setTroncoSelecionado}
            />
          </div>

          <TabsList className="grid h-10 w-full grid-cols-2 sm:w-64">
            <TabsTrigger value="STFC">STFC</TabsTrigger>
            <TabsTrigger value="E164">E164</TabsTrigger>
          </TabsList>
        </div>

        {(["STFC", "E164"] as const).map((tipo) => {
          const regrasDoModelo = regrasRecebidas
            .filter((regra) => regra.tronco_identifier === troncoValue && regra.tipo === tipo)
            .sort((a, b) => a.prioridade - b.prioridade);

          return (
            <TabsContent key={tipo} value={tipo} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GitBranch className="size-4" />
                        Regras {tipo}
                      </CardTitle>

                      <CardDescription>
                        Tronco: {troncoAtual?.nome ?? "Nenhum selecionado"}
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {regrasDoModelo.length} {regrasDoModelo.length === 1 ? "regra" : "regras"}
                      </Badge>

                      <Button
                        onClick={() => abrirNovaRegra(tipo)}
                        disabled={!tenantId || !troncoValue || carregando}
                      >
                        <Plus className="mr-2 size-4" />
                        Nova regra
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => criarRegrasPredefinidas(tipo)}
                        disabled={!tenantId || !troncoValue || carregando || criandoPredefinidas}
                      >
                        {criandoPredefinidas ? (
                          <RefreshCw className="mr-2 size-4 animate-spin" />
                        ) : (
                          <GitBranch className="mr-2 size-4" />
                        )}

                        {criandoPredefinidas ? "Criando regras..." : "Criar regras predefinidas"}
                      </Button>

                      <Button
                        variant={modoSelecao ? "secondary" : "outline"}
                        onClick={() => {
                          setModoSelecao((v) => !v);
                          setSelecionados([]);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {modoSelecao ? "Cancelar seleção" : "Apagar em lote"}
                      </Button>
                      {modoSelecao && (
                        <Button
                          variant="destructive"
                          disabled={selecionados.length === 0 || deleteLoteMutation.isPending}
                          onClick={() => setConfirmarExclusao(true)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Apagar {selecionados.length || ""} selecionados
                        </Button>
                      )}

                      <SimuladorRegra
                        troncoIdentifier={troncoValue}
                        modelo={tipo}
                        regras={regrasDoModelo}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {carregando ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Carregando regras…
                    </div>
                  ) : regrasDoModelo.length > 0 ? (
                    <>
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {modoSelecao && (
                                <TableHead className="w-10">
                                  <input
                                    type="checkbox"
                                    checked={
                                      regrasDoModelo.length > 0 &&
                                      regrasDoModelo.every((regra) =>
                                        selecionados.includes(regra.id),
                                      )
                                    }
                                    onChange={(e) => {
                                      const ids = regrasDoModelo.map((regra) => regra.id);

                                      setSelecionados((atual) =>
                                        e.target.checked
                                          ? [...new Set([...atual, ...ids])]
                                          : atual.filter((id) => !ids.includes(id)),
                                      );
                                    }}
                                  />
                                </TableHead>
                              )}
                              <TableHead className="w-16">Prior.</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Tipo de ligação</TableHead>
                              <TableHead className="w-24">CSP</TableHead>
                              <TableHead>Expressão</TableHead>
                              <TableHead>Expressão transformada</TableHead>
                              <TableHead className="w-24 text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {regrasDoModelo.map((regra) => (
                              <TableRow key={regra.id}>
                                {modoSelecao && (
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={selecionados.includes(regra.id)}
                                      onChange={(e) => {
                                        setSelecionados((atual) =>
                                          e.target.checked
                                            ? [...atual, regra.id]
                                            : atual.filter((id) => id !== regra.id),
                                        );
                                      }}
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="font-medium">{regra.prioridade}</TableCell>

                                <TableCell className="min-w-40 font-medium">
                                  {regra.regra_nome}
                                </TableCell>

                                <TableCell>
                                  <Badge variant="outline">{regra.tipo_ligacao}</Badge>
                                </TableCell>

                                <TableCell>
                                  {regra.codigo_csp ? (
                                    <Badge variant="secondary" className="font-mono">
                                      {regra.codigo_csp}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>

                                <TableCell className="min-w-52">
                                  <code className="break-all font-mono text-xs">
                                    {regra.expressao}
                                  </code>
                                </TableCell>

                                <TableCell className="min-w-52">
                                  <code className="break-all font-mono text-xs">
                                    {regra.expressao_transformada}
                                  </code>
                                </TableCell>

                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Duplicar regra ${regra.regra_nome}`}
                                      title="Duplicar regra"
                                      onClick={() => duplicarRegra(regra)}
                                    >
                                      <Copy className="size-4" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Editar regra ${regra.regra_nome}`}
                                      onClick={() => abrirEdicao(regra)}
                                    >
                                      <Pencil className="size-4" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Excluir regra ${regra.regra_nome}`}
                                      disabled={excluindoId === regra.id}
                                      onClick={() => excluirRegra(regra)}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      {excluindoId === regra.id ? (
                                        <RefreshCw className="size-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-4" />
                                      )}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Apagar {selecionados.length}{" "}
                              {selecionados.length === 1 ? "regra" : "regras"}?
                            </AlertDialogTitle>

                            <AlertDialogDescription>
                              Essa ação removerá as regras selecionados. Essa ação não pode ser
                              desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>

                            <AlertDialogAction
                              disabled={deleteLoteMutation.isPending}
                              onClick={(e) => {
                                e.preventDefault();
                                deleteLoteMutation.mutate({
                                  regras_ids: selecionados,
                                  tronco_identifier: troncoValue,
                                  tipo,
                                });
                              }}
                            >
                              {deleteLoteMutation.isPending ? "Apagando..." : "Apagar regras"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
                      <div className="rounded-full bg-muted p-3">
                        <ListFilter className="size-5 text-muted-foreground" />
                      </div>

                      <div>
                        <h3 className="font-medium">Nenhuma regra encontrada</h3>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Não existem regras {tipo} para este tronco nos dados carregados.
                        </p>
                      </div>

                      {troncoValue && (
                        <Button
                          variant="outline"
                          onClick={() => abrirNovaRegra(tipo)}
                          disabled={!tenantId}
                        >
                          <Plus className="mr-2 size-4" />
                          Criar primeira regra
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          if (!salvando) setDialogAberto(aberto);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {regraEditando ? "Editar regra" : regraCopiando ? "Duplicar regra" : "Nova regra"}
            </DialogTitle>

            <DialogDescription>
              {regraEditando
                ? "Configure os campos da regra. O tronco não pode ser alterado durante a edição."
                : "Configure os campos da regra. Tronco selecionado automaticamente"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={salvarRegra} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regra-tronco">Tronco associado</Label>
              <Input
                id="regra-tronco"
                value={
                  troncos.find(
                    (tronco) =>
                      tronco.tronco_pjsip === (regraEditando?.tronco_identifier ?? troncoValue),
                  )?.nome ??
                  regraEditando?.tronco_nome ??
                  "Nenhum tronco selecionado"
                }
                readOnly
                disabled
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="regra-nome">Nome da regra</Label>
                <Input
                  id="regra-nome"
                  value={form.regra_nome}
                  onChange={(event) => setForm({ ...form, regra_nome: event.target.value })}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="regra-tipo-ligacao">Tipo de ligação</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HelpCircle className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium text-xs mb-1">
                          Selecione o tipo de ligação, servirá para a regra de permissão do ramal.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={form.tipo_ligacao}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      tipo_ligacao: value as Regra["tipo_ligacao"],
                    })
                  }
                >
                  <SelectTrigger id="regra-tipo-ligacao">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="movel">Móvel</SelectItem>
                    <SelectItem value="fixo">Fixo</SelectItem>
                    <SelectItem value="ddi">DDI</SelectItem>
                    <SelectItem value="cng">CNG</SelectItem>
                    <SelectItem value="esp">Especial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="regra-csp">Código CSP</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HelpCircle className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium text-xs mb-1">
                          Código de operadora 3 dígitos, será preenchido no inicio da regra. Ex: 031
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="regra-csp"
                  value={form.codigo_csp}
                  onChange={(event) => setForm({ ...form, codigo_csp: event.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="regra-prioridade">Prioridade</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HelpCircle className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium text-xs mb-1">
                          Defina a prioridade que a expressão será analisada, quanto menor o número,
                          maior a prioridade.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="regra-prioridade"
                  type="number"
                  min={0}
                  step={1}
                  value={form.prioridade}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      prioridade: Number(event.target.value),
                    })
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="regra-expressao">Expressão</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium text-xs mb-1">
                        Regras baseadas em expressão Regex, inicie com ^ e finalize com $, grupos
                        são definidos por ().
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="regra-expressao"
                value={form.expressao}
                onChange={(event) => setForm({ ...form, expressao: event.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="regra-expressao-transformada">Expressão transformada</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium text-xs mb-1">
                        Use \1 ou \2 para definir o grupo que irá para frente, qualquer coisa antes
                        do \ vai ser enviado antes do grupo. Ex: 55\1 - 55123456
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <Input
                id="regra-expressao-transformada"
                value={form.expressao_transformada}
                onChange={(event) =>
                  setForm({
                    ...form,
                    expressao_transformada: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Variáveis Permitidas:</Label> <br />
              <Label className="text-xs text-muted-foreground">
                {"${DDD_AGENTE} - Preenche com o DDD do ramal ao executar a regra"}
              </Label>
            </div>

            {erroFormulario && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {erroFormulario}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>

              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando…" : regraEditando ? "Salvar alterações" : "Criar regra"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectTronco({
  troncos,
  troncoValue,
  carregando,
  onChange,
}: {
  troncos: Tronco[];
  troncoValue: string;
  carregando: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={troncoValue}
      onValueChange={onChange}
      disabled={carregando || troncos.length === 0}
    >
      <SelectTrigger id="seletor-tronco">
        <Cable className="mr-2 size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Selecione um tronco" />
      </SelectTrigger>

      <SelectContent>
        {troncos.map((tronco) => (
          <SelectItem key={tronco.tronco_pjsip} value={tronco.tronco_pjsip}>
            {tronco.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
