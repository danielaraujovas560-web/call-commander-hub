import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, RefreshCw, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import {
  listPesquisaSatisfacao,
  createPesquisaSatisfacao,
  updatePesquisaSatisfacao,
  deletePesquisaSatisfacao,
  listUraAudios,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PerguntaInput {
  id?: number;
  ordem: number;
  audio: string;
  max_digit: number;
}

interface PesquisaSatisfacao {
  id: number;
  nome_pesquisa: string;
  quantidade_op: number;
  ativo: boolean;
  perguntas: PerguntaInput[];
}

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/pesquisa-satisfacao")({
  head: () => ({ meta: [{ title: "Pesquisa de Satisfação — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listPesquisaSatisfacao);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["pesquisa_satisfacao", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });

  const pesquisas = data?.pesquisas ?? [];
  const [editing, setEditing] = useState<PesquisaSatisfacao | null>(null);

  const delFn = useServerFn(deletePesquisaSatisfacao);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Pesquisa removida");
      qc.invalidateQueries({ queryKey: ["pesquisa_satisfacao", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Pesquisas de Satisfação
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as pesquisas quantitativas e ordens de áudio do seu PABX.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <PesquisaFormDialog tenantId={tenantId} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome da Pesquisa</TableHead>
              <TableHead>Total de Perguntas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10">Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && pesquisas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  Nenhuma pesquisa cadastrada.
                </TableCell>
              </TableRow>
            )}
            {pesquisas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome_pesquisa}</TableCell>
                <TableCell>
                  <Badge variant="outline">{p.perguntas?.length ?? 0} pergunta(s)</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={p.ativo ? "default" : "secondary"}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover pesquisa "{p.nome_pesquisa}"?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(p.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <PesquisaFormDialog
          key={editing.id}
          tenantId={tenantId}
          pesquisa={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

function PesquisaFormDialog({
  tenantId, pesquisa, open: co, onOpenChange,
}: {
  tenantId: number;
  pesquisa?: PesquisaSatisfacao;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInternalOpen(v));
  const editing = !!pesquisa;

  const [nomePesquisa, setNomePesquisa] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [perguntas, setPerguntas] = useState<PerguntaInput[]>([]);

  const audiosFn = useServerFn(listUraAudios);
  const { data: audiosData, isLoading: isLoadingAudios } = useQuery({
    queryKey: ["ura-audios", tenantId],
    queryFn: () => audiosFn({ data: { tenant_id: tenantId } }),
    enabled: open, // Só roda a query se o dialog estiver aberto
  });

  const listaAudios = audiosData?.audios ?? audiosData ?? [];

  useEffect(() => {
    if (open) {
      setNomePesquisa(pesquisa?.nome_pesquisa ?? "");
      setAtivo(pesquisa?.ativo ?? true);
      setPerguntas(pesquisa?.perguntas ?? [{ ordem: 1, audio: "", max_digit: 1 }]);
    }
  }, [open, pesquisa]);

  const qc = useQueryClient();
  const createFn = useServerFn(createPesquisaSatisfacao);
  const updateFn = useServerFn(updatePesquisaSatisfacao);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        nome_pesquisa: nomePesquisa,
        quantidade_op: perguntas.length, // Calculado em tempo de execução
        ativo,
        perguntas: perguntas.map((p) => ({
          ...p,
          ordem: Number(p.ordem),
          max_digit: Number(p.max_digit),
        })),
      };

      return editing
        ? updateFn({ data: { id: pesquisa!.id, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Pesquisa atualizada" : "Pesquisa criada");
      qc.invalidateQueries({ queryKey: ["pesquisa_satisfacao", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPergunta = () => {
    // Procura o maior número de ordem atual para sugerir o próximo e evitar conflito de cara
    const maxOrdem = perguntas.reduce((max, p) => (p.ordem > max ? p.ordem : max), 0);
    setPerguntas((prev) => [
      ...prev,
      { ordem: maxOrdem + 1, audio: "", max_digit: 1 },
    ]);
  };

  const removePergunta = (index: number) => {
    setPerguntas((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePergunta = (index: number, key: keyof PerguntaInput, value: any) => {
    setPerguntas((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [key]: value } : p))
    );
  };

  // Validação em tempo real para encontrar ordens repetidas
  const ordensMapeadas = perguntas.map((p) => Number(p.ordem)).filter((o) => !isNaN(o) && o > 0);
  const temOrdemDuplicada = ordensMapeadas.some((ordem, index) => ordensMapeadas.indexOf(ordem) !== index);

  const canSubmit =
    !!nomePesquisa.trim() &&
    perguntas.length > 0 &&
    !temOrdemDuplicada &&
    perguntas.every((p) => p.audio.trim().length > 0 && p.ordem !== undefined && p.ordem !== null && Number(p.ordem) > 0 && p.max_digit > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && (
        <DialogTrigger asChild>
          <Button><Plus className="mr-2 h-4 w-4" /> Nova pesquisa</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar pesquisa" : "Nova pesquisa de satisfação"}</DialogTitle>
          <DialogDescription>
            Defina o nome do fluxo e configure as ordens manuais e arquivos de som das perguntas.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-4 flex-1 overflow-y-auto pr-1"
        >
          <div className="space-y-1">
            <Label>Nome da Pesquisa *</Label>
            <Input
              value={nomePesquisa}
              onChange={(e) => setNomePesquisa(e.target.value)}
              required
              maxLength={100}
              placeholder="Ex: Avaliação Geral de Suporte"
            />
          </div>

          <div className="flex items-center space-x-2 pb-2">
            <Checkbox
              id="ativo"
              checked={ativo}
              onCheckedChange={(v) => setAtivo(!!v)}
            />
            <Label htmlFor="ativo" className="cursor-pointer">Pesquisa ativa</Label>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="space-y-0.5">
                <Label className="text-base font-semibold">Perguntas</Label>
                {temOrdemDuplicada && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium animate-pulse">
                    <AlertCircle className="h-3 w-3" /> Existem ordens numéricas repetidas!
                  </p>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addPergunta}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Pergunta
              </Button>
            </div>

            {perguntas.map((pergunta, index) => {
              // Verifica se a ordem desta pergunta específica está duplicada no array
              const isDuplicated = ordensMapeadas.filter((o) => o === Number(pergunta.ordem)).length > 1;

              return (
                <div key={index} className="flex gap-3 items-start bg-muted/40 p-3 rounded-md border relative">
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Ordem *</Label>
                    <Input
                      type="number"
                      value={pergunta.ordem}
                      onChange={(e) => updatePergunta(index, "ordem", e.target.value === "" ? undefined : Number(e.target.value))}
                      required
                      min={1}
                      className={`h-8 text-center ${isDuplicated ? "border-destructive focus-visible:ring-destructive bg-destructive/5 text-destructive font-bold" : ""}`}
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Arquivo de Áudio *</Label>
                    <Select
                      value={pergunta.audio}
                      onValueChange={(val) => updatePergunta(index, "audio", val)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={isLoadingAudios ? "Carregando..." : "Selecione o áudio..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {listaAudios.map((audio: any, audioIdx: number) => {
                          // Suporta se retornar um array de strings ou objetos
                          const audioNome = typeof audio === "string" ? audio : audio.nome || audio.arquivo;
                          const audioValor = typeof audio === "string" ? audio : audio.id?.toString() || audio.nome;
                          
                          return (
                            <SelectItem key={audioIdx} value={audioValor}>
                              {audioNome}
                            </SelectItem>
                          );
                        })}
                        {!isLoadingAudios && listaAudios.length === 0 && (
                          <div className="p-2 text-xs text-muted-foreground text-center">Nenhum áudio encontrado</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Dígitos Máx. *</Label>
                    <Input
                      type="number"
                      value={pergunta.max_digit}
                      onChange={(e) => updatePergunta(index, "max_digit", Number(e.target.value))}
                      required
                      min={1}
                      className="h-8"
                    />
                  </div>

                  {perguntas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive mt-5"
                      onClick={() => removePergunta(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="pt-4 border-t sticky bottom-0 bg-background">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending || !canSubmit}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
