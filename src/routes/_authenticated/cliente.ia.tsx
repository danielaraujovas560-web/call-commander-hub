import { FieldHelp } from "@/components/field-help";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Volume2,
  Trash2,
  HelpCircle,
  Search,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import {
  listIa,
  listIaModels,
  listIaVoices,
  createIa,
  updateIa,
  deleteIa,
  createIaVoice,
  updateIaVoice,
  deleteIaVoice,
  type IA,
  type IaModel,
  type IaVoice,
} from "@/lib/ia.functions";

import { getConfiguracoes } from "@/lib/configuracoes.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useClienteContext } from "@/context/cliente-context";

export const Route = createFileRoute("/_authenticated/cliente/ia")({
  head: () => ({
    meta: [{ title: "IA — Cliente — Painel PABX" }],
  }),
  beforeLoad: async () => {
    // Chama a server function direto no servidor/loader da rota
    const configuracoes = await getConfiguracoes({
      data: {
        chaves: ["modulos.ia"],
      },
    });

    const iaEnabled = configuracoes?.some(
      (config) => config.chave === "modulos.ia" && config.valor === "true",
    );
    if (!iaEnabled) {
      throw new Error("403: Módulo não autorizado");
    }
  },
  errorComponent: () => (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-muted-foreground">Ops! O módulo de IA não está ativo.</p>
    </div>
  ),
  component: IaPage,
});

function IaPage() {
  const { tenantId } = useClienteContext();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"vozes" | "ias">("ias");
  const [busca, setBusca] = useState("");

  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [iaDialogOpen, setIaDialogOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  const [voiceForm, setVoiceForm] = useState({
    nome: "",
    voice_id: "",
    ia_model_id: "",
  });

  const [iaForm, setIaForm] = useState({
    nome: "",
    ia_model_id_logica: "",
    ia_voice_id: "",
    confianca_minima: "0.75",
    tempo_maximo: "15",
    silencio_apos_fala: "1.5",
    ativa: true,
  });

  const createIaFn = useServerFn(createIa);
  const updateIaFn = useServerFn(updateIa);
  const deleteIaFn = useServerFn(deleteIa);

  const createIaVoiceFn = useServerFn(createIaVoice);
  const updateIaVoiceFn = useServerFn(updateIaVoice);
  const deleteIaVoiceFn = useServerFn(deleteIaVoice);

  const [editingVoice, setEditingVoice] = useState<IaVoice | null>(null);
  const [editingIa, setEditingIa] = useState<IA | null>(null);

  const listIaFn = useServerFn(listIa);
  const listModelsFn = useServerFn(listIaModels);
  const listVoicesFn = useServerFn(listIaVoices);

  // =========================
  // QUERIES
  // =========================

  const voicesQuery = useQuery({
    queryKey: ["ia-voices", tenantId],
    queryFn: () => listVoicesFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });

  const modelsQuery = useQuery({
    queryKey: ["ia-models"],
    queryFn: () => listModelsFn(),
  });

  const iaQuery = useQuery({
    queryKey: ["ia", tenantId],
    queryFn: () =>
      listIaFn({
        data: {
          tenant_id: tenantId,
        },
      }),
    enabled: !!tenantId,
  });

  const voices = voicesQuery.data?.vozes ?? [];
  const models = modelsQuery.data?.modelos ?? [];
  const ias = iaQuery.data?.ia ?? [];
  const termoBusca = busca.trim().toLocaleLowerCase("pt-BR");
  const iasVisiveis = ias.filter((item) =>
    !termoBusca ||
    [item.nome, item.modelo_logico?.nome, item.modelo_logico?.provider, item.voz?.nome]
      .some((valor) => String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termoBusca)),
  );
  const vozesVisiveis = voices.filter((item) =>
    !termoBusca ||
    [item.nome, item.voice_id, item.modelo?.nome, item.modelo?.provider]
      .some((valor) => String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termoBusca)),
  );

  const logicalModels = models.filter((model) => model.tipo === "Logico");
  const totalIasAtivas = ias.filter((ia) => ia.ativa).length;

  // =========================
  // REFRESH
  // =========================

  const refresh = () => {
    qc.invalidateQueries({
      queryKey: ["ia"],
    });

    qc.invalidateQueries({
      queryKey: ["ia-voices"],
    });

    qc.invalidateQueries({
      queryKey: ["ia-models"],
    });

    toast.success("Dados atualizados");
  };

  const isFetching = voicesQuery.isFetching || modelsQuery.isFetching || iaQuery.isFetching;

  // =========================
  // EDITAR VOZ
  // =========================

  const openEditVoice = (voice: IaVoice) => {
    setEditingVoice(voice);
  };

  // =========================
  // EDITAR IA
  // =========================

  const openEditIa = (ia: IA) => {
    setEditingIa(ia);
  };

  // =========================
  // NOVA VOZ
  // =========================

  const openNewVoice = () => {
    setEditingVoice(null);
    setVoiceForm({
      nome: "",
      voice_id: "",
      ia_model_id: "",
    });
    setVoiceDialogOpen(true);
  };

  // =========================
  // NOVA IA
  // =========================

  const openNewIa = () => {
    setEditingIa(null);
    setIaForm({
      nome: "",
      ia_model_id_logica: "",
      ia_voice_id: "",
      confianca_minima: "0.75",
      tempo_maximo: "15",
      silencio_apos_fala: "1.5",
      ativa: true,
    });
    setIaDialogOpen(true);
  };

  // =========================
  // SALVAR VOZ
  // =========================

  const saveVoice = async () => {
    if (!voiceForm.nome.trim() || !voiceForm.voice_id.trim() || !voiceForm.ia_model_id) {
      toast.error("Preencha todos os campos da voz.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        tenant_id: tenantId,
        nome: voiceForm.nome.trim(),
        voice_id: voiceForm.voice_id.trim(),
        ia_model_id: Number(voiceForm.ia_model_id),
      };

      if (editingVoice) {
        await updateIaVoiceFn({
          data: {
            id: editingVoice.id,
            ...payload,
          },
        });

        toast.success("Voz atualizada com sucesso.");
      } else {
        await createIaVoiceFn({ data: payload });
        toast.success("Voz criada com sucesso.");
      }

      setVoiceDialogOpen(false);
      setEditingVoice(null);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ia-voices"] }),
        qc.invalidateQueries({ queryKey: ["ia"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar voz.");
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // EXCLUIR VOZ
  // =========================

  const removeVoice = async (voice: IaVoice) => {
    if (!window.confirm(`Deseja realmente excluir a voz "${voice.nome}"?`)) {
      return;
    }

    try {
      await deleteIaVoiceFn({
        data: { id: voice.id, tenant_id: tenantId },
      });

      toast.success("Voz excluída com sucesso.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ia-voices"] }),
        qc.invalidateQueries({ queryKey: ["ia"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir voz.");
    }
  };

  // =========================
  // SALVAR IA
  // =========================

  const saveIa = async () => {
    if (!iaForm.nome.trim() || !iaForm.ia_model_id_logica || !iaForm.ia_voice_id) {
      toast.error("Preencha o nome, o modelo lógico e a voz.");
      return;
    }

    const confianca = Number(iaForm.confianca_minima);
    const tempo = Number(iaForm.tempo_maximo);
    const silencio = Number(iaForm.silencio_apos_fala);

    if (
      !Number.isFinite(confianca) ||
      confianca < 0 ||
      confianca > 1 ||
      !Number.isInteger(tempo) ||
      tempo < 0 ||
      !Number.isFinite(silencio) ||
      silencio < 0
    ) {
      toast.error("Confira os valores dos parâmetros da IA.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        tenant_id: tenantId,
        nome: iaForm.nome.trim(),
        ia_model_id_logica: Number(iaForm.ia_model_id_logica),
        ia_voice_id: Number(iaForm.ia_voice_id),
        confianca_minima: confianca,
        tempo_maximo: tempo,
        silencio_apos_fala: silencio,
        ativa: iaForm.ativa,
      };

      if (editingIa) {
        await updateIaFn({
          data: {
            id: editingIa.id,
            ...payload,
          },
        });

        toast.success("IA atualizada com sucesso.");
      } else {
        await createIaFn({ data: payload });
        toast.success("IA criada com sucesso.");
      }

      setIaDialogOpen(false);
      setEditingIa(null);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ia"] }),
        qc.invalidateQueries({ queryKey: ["ia-voices"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar IA.");
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // EXCLUIR IA
  // =========================

  const removeIa = async (ia: IA) => {
    if (!window.confirm(`Deseja realmente excluir a IA "${ia.nome}"?`)) {
      return;
    }

    try {
      await deleteIaFn({
        data: { id: ia.id, tenant_id: tenantId },
      });

      toast.success("IA excluída com sucesso.");

      await qc.invalidateQueries({ queryKey: ["ia"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir IA.");
    }
  };

  return (
    <div className="min-w-0 space-y-4 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Inteligência Artificial</h1>
          <p className="text-sm text-muted-foreground">Configure as IAs e vozes utilizadas no atendimento.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Atualizar dados" title="Atualizar dados" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {activeTab === "vozes" ? (
            <Button onClick={openNewVoice}><Plus className="mr-2 h-4 w-4" />Nova voz</Button>
          ) : (
            <Button onClick={openNewIa}><Plus className="mr-2 h-4 w-4" />Nova IA</Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-muted-foreground">Inteligências artificiais</p><p className="text-2xl font-bold">{ias.length}</p></div>
            <Bot className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-muted-foreground">IAs ativas</p><p className="text-2xl font-bold">{totalIasAtivas}</p></div>
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-muted-foreground">Vozes cadastradas</p><p className="text-2xl font-bold">{voices.length}</p></div>
            <Volume2 className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => { setActiveTab(value as "vozes" | "ias"); setBusca(""); }}
        className="w-full space-y-3"
      >
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="ias" className="gap-2"><Bot className="h-4 w-4" />IAs</TabsTrigger>
          <TabsTrigger value="vozes" className="gap-2"><Volume2 className="h-4 w-4" />Vozes</TabsTrigger>
        </TabsList>

        {/* =========================
            TAB IAS
        ========================= */}

        <TabsContent value="ias" className="mt-0">
          <Card className="overflow-hidden">
            <CardHeader className="p-4 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Inteligências artificiais</CardTitle>
                  <CardDescription>Modelos configurados para o atendimento.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar IA ou modelo..." className="h-9 pl-9" aria-label="Buscar inteligências artificiais" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Modelo lógico</TableHead>
                  <TableHead>Voz</TableHead>
                  <TableHead>Confiança</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {iaQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}

                {!iaQuery.isLoading && iasVisiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {busca ? "Nenhuma IA corresponde à busca." : "Nenhuma IA cadastrada para este cliente."}
                    </TableCell>
                  </TableRow>
                )}

                {iasVisiveis.map((ia) => (
                  <TableRow key={ia.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />

                        <span className="font-medium">{ia.nome}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <div className="font-medium">{ia.modelo_logico.nome}</div>

                        <div className="text-xs text-muted-foreground">
                          {ia.modelo_logico.provider}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {ia.voz ? (
                        <div>
                          <div className="font-medium">{ia.voz.nome}</div>

                          <div className="text-xs text-muted-foreground">{ia.modelo_voz.nome}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell>{(ia.confianca_minima * 100).toFixed(0)}%</TableCell>

                    <TableCell>
                      <Badge variant={ia.ativa ? "default" : "secondary"}>{ia.ativa ? "Ativa" : "Inativa"}</Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setIaForm({
                            nome: ia.nome,
                            ia_model_id_logica: String(ia.modelo_logico.id),
                            ia_voice_id: String(ia.voz?.id ?? ""),
                            confianca_minima: String(ia.confianca_minima),
                            tempo_maximo: String(ia.tempo_maximo),
                            silencio_apos_fala: String(ia.silencio_apos_fala),
                            ativa: ia.ativa,
                          });

                          openEditIa(ia);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button variant="ghost" size="icon" onClick={() => removeIa(ia)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================
            TAB VOZES
        ========================= */}

        <TabsContent value="vozes" className="mt-0">
          <Card className="overflow-hidden">
            <CardHeader className="p-4 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Vozes</CardTitle>
                  <CardDescription>Vozes disponíveis para as inteligências artificiais.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar voz ou ID..." className="h-9 pl-9" aria-label="Buscar vozes" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Voice ID</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {voicesQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}

                {!voicesQuery.isLoading && vozesVisiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {busca ? "Nenhuma voz corresponde à busca." : "Nenhuma voz cadastrada para este cliente."}
                    </TableCell>
                  </TableRow>
                )}

                {vozesVisiveis.map((voice) => (
                  <TableRow key={voice.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-muted-foreground" />

                        <span className="font-medium">{voice.nome}</span>
                      </div>
                    </TableCell>

                    <TableCell>{voice.modelo.provider}</TableCell>

                    <TableCell>{voice.modelo.nome}</TableCell>

                    <TableCell>
                      <span className="font-mono text-sm">{voice.voice_id}</span>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setVoiceForm({
                            nome: voice.nome,
                            voice_id: voice.voice_id,
                            ia_model_id: String(voice.modelo.id),
                          });

                          openEditVoice(voice);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button variant="ghost" size="icon" onClick={() => removeVoice(voice)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =========================
          DIALOG NOVA / EDITAR VOZ
      ========================= */}

      <Dialog
        open={voiceDialogOpen || editingVoice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVoiceDialogOpen(false);
            setEditingVoice(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVoice ? "Editar voz" : "Nova voz"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5"><Label>Nome</Label> <FieldHelp text="Nome usado para identificar este registro na página de ia." /></div>

              <Input
                value={voiceForm.nome}
                onChange={(e) => setVoiceForm({ ...voiceForm, nome: e.target.value })}
                placeholder="Ex: Voz principal"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Modelo de voz</Label>
                <FieldHelp text="Novos modelos de vez deverão ser solicitados ao Administrador para cadastro." />
              </div>

              <Select
                value={voiceForm.ia_model_id}
                onValueChange={(value) => setVoiceForm({ ...voiceForm, ia_model_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>

                <SelectContent>
                  {models
                    .filter((model) => model.tipo === "Voz" && model.ativo)
                    .map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.nome} — {model.provider}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Voice ID</Label>
                <FieldHelp text="Escreva o identificador da voz em minúsculo (ex.: sarah), conforme o provedor de TTS." />
              </div>

              <Input
                value={voiceForm.voice_id}
                onChange={(e) => setVoiceForm({ ...voiceForm, voice_id: e.target.value })}
                placeholder="Ex: sarah"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVoiceDialogOpen(false);
                setEditingVoice(null);
              }}
            >
              Cancelar
            </Button>

            <Button onClick={saveVoice} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================
          DIALOG NOVA / EDITAR IA
      ========================= */}

      <Dialog
        open={iaDialogOpen || editingIa !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIaDialogOpen(false);
            setEditingIa(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingIa ? "Editar IA" : "Nova IA"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5"><Label>Nome</Label> <FieldHelp text="Nome usado para identificar este registro na página de ia." /></div>

              <Input
                value={iaForm.nome}
                onChange={(e) => setIaForm({ ...iaForm, nome: e.target.value })}
                placeholder="Ex: Atendimento automático"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5"><Label>Modelo lógico</Label> <FieldHelp text="Modelo de IA responsável pelo processamento e pela tomada de decisão." /></div>

              <Select
                value={iaForm.ia_model_id_logica}
                onValueChange={(value) => setIaForm({ ...iaForm, ia_model_id_logica: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>

                <SelectContent>
                  {logicalModels
                    .filter((model) => model.ativo)
                    .map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.nome} — {model.provider}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Voz</Label>
                <FieldHelp text="O modelo de voz será definido pela voz selecionada." />
              </div>

              <Select
                value={iaForm.ia_voice_id}
                onValueChange={(value) => setIaForm({ ...iaForm, ia_voice_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma voz" />
                </SelectTrigger>

                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem key={voice.id} value={String(voice.id)}>
                      {voice.nome} — {voice.modelo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Confiança mínima</Label>
                <FieldHelp text="Ex.: 0.750 significa 75% de confiança mínima." />
              </div>

              <Input
                type="number"
                min="0"
                max="1"
                step="0.001"
                value={iaForm.confianca_minima}
                onChange={(e) => setIaForm({ ...iaForm, confianca_minima: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Tempo máximo</Label>
                <FieldHelp text="Tempo máximo permitido para processamento da IA, em segundos." />
              </div>

              <Input
                type="number"
                min="0"
                step="1"
                value={iaForm.tempo_maximo}
                onChange={(e) => setIaForm({ ...iaForm, tempo_maximo: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label>Silêncio após fala</Label>
                <FieldHelp text="Tempo de silêncio, em segundos, antes do processamento." />
              </div>

              <Input
                type="number"
                min="0"
                step="0.1"
                value={iaForm.silencio_apos_fala}
                onChange={(e) => setIaForm({ ...iaForm, silencio_apos_fala: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIaDialogOpen(false);
                setEditingIa(null);
              }}
            >
              Cancelar
            </Button>

            <Button onClick={saveIa} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Settings2 className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
