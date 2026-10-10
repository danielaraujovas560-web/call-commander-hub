import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { toast } from "sonner";

import {
  listIa,
  listIaModels,
  listIaVoices,
  type IA,
  type IaModel,
  type IaVoice,
} from "@/lib/ia.functions";

import { Button } from "@/components/ui/button";
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

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useClienteContext } from "./_cliente-context";

export const Route = createFileRoute("/_authenticated/cliente/ia")({
  head: () => ({
    meta: [{ title: "IA — Cliente — Painel PABX" }],
  }),
  component: IaPage,
});

function IaPage() {
  const { tenantId } = useClienteContext();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"vozes" | "ias">("vozes");

  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [iaDialogOpen, setIaDialogOpen] = useState(false);

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
    queryFn: () => listVoicesFn(),
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

  const logicalModels = models.filter(
    (model) => model.tipo === "Logico",
  );

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

  const isFetching =
    voicesQuery.isFetching ||
    modelsQuery.isFetching ||
    iaQuery.isFetching;

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
    setVoiceDialogOpen(true);
  };

  // =========================
  // NOVA IA
  // =========================

  const openNewIa = () => {
    setEditingIa(null);
    setIaDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "vozes" | "ias")
        }
        className="w-full space-y-6"
      >
        {/* =========================
            CABEÇALHO
        ========================= */}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Inteligência Artificial
            </h1>

            <p className="text-sm text-muted-foreground">
              Configure as vozes e inteligências artificiais deste cliente.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isFetching ? "animate-spin" : ""
                }`}
              />
            </Button>

            {activeTab === "vozes" ? (
              <Button onClick={openNewVoice}>
                <Plus className="mr-2 h-4 w-4" />
                Nova voz
              </Button>
            ) : (
              <Button onClick={openNewIa}>
                <Plus className="mr-2 h-4 w-4" />
                Nova IA
              </Button>
            )}
          </div>
        </div>

        {/* =========================
            TABS
        ========================= */}

        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger
            value="vozes"
            className="flex items-center gap-2"
          >
            <Volume2 className="h-4 w-4" />
            Vozes
          </TabsTrigger>

          <TabsTrigger
            value="ias"
            className="flex items-center gap-2"
          >
            <Bot className="h-4 w-4" />
            IAs
          </TabsTrigger>
        </TabsList>

        {/* =========================
            TAB VOZES
        ========================= */}

        <TabsContent value="vozes" className="space-y-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Voice ID</TableHead>
                  <TableHead className="text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {voicesQuery.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}

                {!voicesQuery.isLoading && voices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Nenhuma voz cadastrada para este cliente.
                    </TableCell>
                  </TableRow>
                )}

                {voices.map((voice) => (
                  <TableRow key={voice.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-muted-foreground" />

                        <span className="font-medium">
                          {voice.nome}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {voice.modelo.provider}
                    </TableCell>

                    <TableCell>
                      {voice.modelo.nome}
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-sm">
                        {voice.voice_id}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditVoice(voice)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* =========================
            TAB IAS
        ========================= */}

        <TabsContent value="ias" className="space-y-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Modelo lógico</TableHead>
                  <TableHead>Voz</TableHead>
                  <TableHead>Confiança</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {iaQuery.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}

                {!iaQuery.isLoading && ias.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Nenhuma IA cadastrada para este cliente.
                    </TableCell>
                  </TableRow>
                )}

                {ias.map((ia) => (
                  <TableRow key={ia.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />

                        <span className="font-medium">
                          {ia.nome}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {ia.modelo_logico.nome}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {ia.modelo_logico.provider}
                        </div>
                      </div>
                    </TableCell>

<TableCell>
  {ia.voz ? (
    <div>
      <div className="font-medium">
        {ia.voz.nome}
      </div>

      <div className="text-xs text-muted-foreground">
        {ia.modelo_voz.nome}
      </div>
    </div>
  ) : (
    "—"
  )}
</TableCell>

                    <TableCell>
                      {(ia.confianca_minima * 100).toFixed(0)}%
                    </TableCell>

                    <TableCell>
                      {ia.ativa ? (
                        <span className="text-sm text-green-600">
                          Ativa
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Inativa
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditIa(ia)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVoice ? "Editar voz" : "Nova voz"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>

              <Input
                defaultValue={editingVoice?.nome ?? ""}
                placeholder="Ex: Voz principal"
              />
            </div>

            <div className="space-y-1">
              <Label>Modelo de voz</Label>

<Select
  defaultValue={editingVoice?.modelo.id?.toString() ?? ""}
>
  <SelectTrigger>
    <SelectValue placeholder="Selecione um modelo" />
  </SelectTrigger>

  <SelectContent>
    {models
      .filter((model) => model.tipo === "Voz")
      .map((model) => (
        <SelectItem
          key={model.id}
          value={model.id.toString()}
        >
          {model.nome} — {model.provider}
        </SelectItem>
      ))}
  </SelectContent>
</Select>

            </div>

            <div className="space-y-1">
              <Label>Voice ID</Label>

              <Input
                defaultValue={editingVoice?.voice_id ?? ""}
                placeholder="Ex: cgSgspJ2msm6clMCkdW9"
              />

              <p className="text-xs text-muted-foreground">
                Identificador da voz no provedor de TTS.
              </p>
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

            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingIa ? "Editar IA" : "Nova IA"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>

              <Input
                defaultValue={editingIa?.nome ?? ""}
                placeholder="Ex: Atendimento automático"
              />
            </div>

            <div className="space-y-1">
              <Label>Modelo lógico</Label>

<Select
  defaultValue={editingIa?.modelo_logico.id?.toString() ?? ""}
>
  <SelectTrigger>
    <SelectValue placeholder="Selecione um modelo" />
  </SelectTrigger>

  <SelectContent>
    {logicalModels.map((model) => (
      <SelectItem
        key={model.id}
        value={model.id.toString()}
      >
        {model.nome} — {model.provider}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
            </div>

            <div className="space-y-1">
              <Label>Voz</Label>

<Select
  defaultValue={editingIa?.voz?.id?.toString() ?? ""}
>
  <SelectTrigger>
    <SelectValue placeholder="Selecione uma voz" />
  </SelectTrigger>

  <SelectContent>
    {voices.map((voice) => (
      <SelectItem
        key={voice.id}
        value={voice.id.toString()}
      >
        {voice.nome} — {voice.modelo.nome}
      </SelectItem>
    ))}
  </SelectContent>
</Select>

<p className="text-xs text-muted-foreground">
  O modelo de voz será definido pela voz selecionada.
</p>

            </div>

            <div className="space-y-1">
              <Label>Confiança mínima</Label>

              <Input
                type="number"
                min="0"
                max="1"
                step="0.001"
                defaultValue={
                  editingIa?.confianca_minima ?? 0.75
                }
              />

              <p className="text-xs text-muted-foreground">
                Ex: 0.750 significa 75% de confiança mínima.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Tempo máximo</Label>

              <Input
                type="number"
                min="1"
                defaultValue={
                  editingIa?.tempo_maximo ?? 15
                }
              />

              <p className="text-xs text-muted-foreground">
                Tempo máximo permitido para processamento da IA.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Silêncio após fala</Label>

              <Input
                type="number"
                min="0"
                step="0.1"
                defaultValue={
                  editingIa?.silencio_apos_fala ?? 1.5
                }
              />

              <p className="text-xs text-muted-foreground">
                Tempo de silêncio, em segundos, antes do processamento.
              </p>
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

            <Button disabled>
              <Settings2 className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
