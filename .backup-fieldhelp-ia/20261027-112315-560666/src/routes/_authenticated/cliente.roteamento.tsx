import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Router as RouterIcon, RefreshCw, Plus, Pencil, Trash2, Search, Phone, GitBranch, MessageCircle, Loader2 } from "lucide-react";
import {
  listRoteamento,
  createRoteamento,
  updateRoteamento,
  deleteRoteamento,
  type RoteamentoItem,
} from "@/lib/roteamento.functions";
import { listUraDestinos } from "@/lib/uras.functions.ts";
import {
  DestinoPicker,
  emptyDestino,
  parseDestinoFromBackend,
  buildDestinoForBackend,
  isDestinoIncomplete,
  renderDestinoLabel,
  type DestinoValue,
  type DestinoTipo,
} from "@/components/destino-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsAdmin } from "@/hooks/use-role";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useClienteContext } from "@/context/cliente-context";

// Roteamento pode apontar para qualquer ação (inclui HORARIO_ATENDIMENTO
// para redirecionar a chamada pra regra que decide dentro/fora).
const ACOES_ROTEAMENTO = [
  { value: "RAMAL", label: "Ramal" },
  { value: "FILA", label: "Fila" },
  { value: "URA", label: "Ura" },
  { value: "EXTERNO", label: "Número Externo" },
  { value: "REGRA_HORARIO", label: "Horário de Atendimento" },
  { value: "AUDIO", label: "Áudio" },
] as const;

const ACOES_ROTEAMENTO_VALUES = ACOES_ROTEAMENTO.map((a) => a.value);

function getAcaoLabel(tipo: string): string {
  return ACOES_ROTEAMENTO.find((a) => a.value === tipo)?.label ?? tipo;
}

export const Route = createFileRoute("/_authenticated/cliente/roteamento")({
  head: () => ({ meta: [{ title: "Roteamento — Cliente — Painel PABX" }] }),
  component: RoteamentoPage,
});

function RoteamentoPage() {
  const { tenantId, cliente } = useClienteContext();
  const qc = useQueryClient();
  const fn = useServerFn(listRoteamento);
  const { isAdmin } = useIsAdmin();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["roteamento", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });
  const rows = data?.roteamento ?? [];
  const [editing, setEditing] = useState<RoteamentoItem | null>(null);
  const [busca, setBusca] = useState("");

  const destinosFn = useServerFn(listUraDestinos);
  const { data: destinos } = useQuery({
    queryKey: ["ura-destinos", tenantId],
    queryFn: () => destinosFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });

  const delFn = useServerFn(deleteRoteamento);
  const delMut = useMutation({
    mutationFn: (numero: string) => delFn({ data: { numero, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Roteamento removido");
      qc.invalidateQueries({ queryKey: ["roteamento", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const termo = busca.trim().toLowerCase();
  const filteredRows = rows.filter((r) =>
    !termo ||
    String(r.numero ?? "").toLowerCase().includes(termo) ||
    String(r.descricao ?? "").toLowerCase().includes(termo) ||
    getAcaoLabel(r.tipo_destino).toLowerCase().includes(termo) ||
    String(r.destino ?? "").toLowerCase().includes(termo)
  );
  const totalIntegrados = rows.filter((r) => r.whatsapp_config_id != null).length;
  const totalTipos = new Set(rows.map((r) => r.tipo_destino)).size;

  return (
    <div className="space-y-4 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <RouterIcon className="h-6 w-6" /> Roteamento
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie os números e seus destinos de chamadas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar roteamentos"
            title="Atualizar roteamentos"
            onClick={() => void refetch()}
            disabled={!tenantId || isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {isAdmin && <RoteamentoFormDialog tenantId={tenantId} />}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-6 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Roteamentos</p>
              <p className="text-3xl font-bold">{rows.length}</p>
            </div>
            <Phone className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Com integração</p>
              <p className="text-3xl font-bold">{totalIntegrados}</p>
            </div>
            <MessageCircle className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Tipos de destino em uso</p>
              <p className="text-3xl font-bold">{totalTipos}</p>
            </div>
            <GitBranch className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Números e destinos</CardTitle>
              <CardDescription>Consulte e gerencie os roteamentos do cliente atual.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número, descrição, destino…"
                className="pl-9"
                aria-label="Buscar roteamentos"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Falha ao listar roteamentos: {(error as Error).message}
              <Button className="ml-2" size="sm" variant="outline" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Número</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Integração</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!tenantId || isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          {!tenantId ? "Aguardando identificação do cliente…" : "Carregando…"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                        {busca ? "Nenhum roteamento encontrado para esta busca." : "Nenhum roteamento cadastrado."}
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.map((r) => (
                    <TableRow key={r.numero} className="hover:bg-muted/30">
                      <TableCell className="whitespace-nowrap font-mono font-medium">{r.numero}</TableCell>
                      <TableCell className="max-w-64 truncate" title={r.descricao ?? undefined}>
                        {r.descricao || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getAcaoLabel(r.tipo_destino)}</Badge>
                      </TableCell>
                      <TableCell>{renderDestinoLabel(destinos, r.tipo_destino, r.destino)}</TableCell>
                      <TableCell>
                        <Badge variant={r.whatsapp_config_id != null ? "default" : "secondary"}>
                          {r.whatsapp_config_id != null ? "Vinculada" : "Nenhuma"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Editar roteamento" aria-label={`Editar roteamento ${r.numero}`} onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="Remover roteamento" aria-label={`Remover roteamento ${r.numero}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover roteamento de {r.numero}?</AlertDialogTitle>
                                  <AlertDialogDescription>Não remove o número, apenas o roteamento.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction disabled={delMut.isPending} onClick={() => delMut.mutate(r.numero)}>
                                    {delMut.isPending ? "Removendo…" : "Remover"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && !error && rows.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Exibindo {filteredRows.length} de {rows.length} roteamentos.
            </p>
          )}
        </CardContent>
      </Card>

      {editing && (
        <RoteamentoFormDialog
          tenantId={tenantId}
          item={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

function RoteamentoFormDialog({
  tenantId,
  item,
  open: co,
  onOpenChange,
}: {
  tenantId: number;
  item?: RoteamentoItem;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { isAdmin } = useIsAdmin();
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInternalOpen(v));
  const editing = !!item;

  const [numero, setNumero] = useState<string>(item?.numero ? String(item.numero) : "");
  const [whatsConfig, setWhatsConfig] = useState<number | null>(
    item?.whatsapp_config_id != null ? Number(item.whatsapp_config_id) : null,
  );
  const [dest, setDest] = useState<DestinoValue>(
    item ? parseDestinoFromBackend(item.tipo_destino, item.destino) : { ...emptyDestino },
  );
  const [descricao, setDescricao] = useState<string>(item?.descricao ?? "");

  useEffect(() => {
    if (open) {
      setWhatsConfig(item?.whatsapp_config_id != null ? Number(item.whatsapp_config_id) : null);
      setNumero(item?.numero ? String(item.numero) : "");
      setDest(
        item ? parseDestinoFromBackend(item.tipo_destino, item.destino) : { ...emptyDestino },
      );
      setDescricao(item?.descricao ?? "");
    }
  }, [open, item]);

  const qc = useQueryClient();
  const createFn = useServerFn(createRoteamento);
  const updateFn = useServerFn(updateRoteamento);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        whatsapp_config_id: whatsConfig,
        numero: numero,
        tipo_destino: dest.tipo as Exclude<DestinoTipo, "INTERNO">,
        destino: buildDestinoForBackend(dest),
        descricao: descricao,
      };
      return editing
        ? updateFn({ data: { numero: item!.numero, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Roteamento atualizado" : "Roteamento criado");
      qc.invalidateQueries({ queryKey: ["roteamento", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = !numero || isDestinoIncomplete(dest);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo roteamento
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar roteamento" : "Novo roteamento"}</DialogTitle>
          <DialogDescription>Cada número aponta para um único destino.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label>Número *</Label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex.: 2733334444"
              disabled={editing && !isAdmin}
            />
            <Label>WebHook</Label>
            <Input
              type="number"
              value={whatsConfig ?? ""}
              onChange={(e) => {
                const valor = e.target.value;
                setWhatsConfig(valor === "" ? null : Number(valor));
              }}
              placeholder="Escolha o WebHook"
            />
          </div>
          <DestinoPicker
            tenantId={tenantId}
            value={dest}
            onChange={setDest}
            allow={ACOES_ROTEAMENTO}
          />
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição opcional do número"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled || mut.isPending}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
