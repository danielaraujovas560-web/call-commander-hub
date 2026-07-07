import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Router as RouterIcon, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listRoteamento, createRoteamento, updateRoteamento, deleteRoteamento,
  listNumeros, listUraDestinos,
  type RoteamentoItem,
} from "@/lib/ramais.functions";
import {
  DestinoPicker, emptyDestino, parseDestinoFromBackend, buildDestinoForBackend,
  isDestinoIncomplete, renderDestinoLabel,
  type DestinoValue, type DestinoTipo,
} from "@/components/destino-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Roteamento pode apontar para qualquer ação (inclui HORARIO_ATENDIMENTO
// para redirecionar a chamada pra regra que decide dentro/fora).
const ACOES_ROTEAMENTO: readonly DestinoTipo[] = [
  "RAMAL", "FILA", "URA", "EXTERNO", "HORARIO_ATENDIMENTO", "AUDIO",
];

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/roteamento")({
  head: () => ({ meta: [{ title: "Roteamento — Cliente — Painel PABX" }] }),
  component: RoteamentoPage,
});

function RoteamentoPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listRoteamento);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["roteamento", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const rows = data?.roteamento ?? [];
  const [editing, setEditing] = useState<RoteamentoItem | null>(null);

  const destinosFn = useServerFn(listUraDestinos);
  const { data: destinos } = useQuery({
    queryKey: ["ura-destinos", tenantId],
    queryFn: () => destinosFn({ data: { tenant_id: tenantId } }),
  });

  const delFn = useServerFn(deleteRoteamento);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Roteamento removido"); qc.invalidateQueries({ queryKey: ["roteamento", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RouterIcon className="h-6 w-6" /> Roteamento</h1>
          <p className="text-sm text-muted-foreground">Cada número aponta para 1 destino.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <RoteamentoFormDialog tenantId={tenantId} />
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</div>}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Sem roteamentos.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.numero}</TableCell>
                <TableCell>{r.descricao ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{r.tipo_destino}</Badge></TableCell>
                <TableCell>{renderDestinoLabel(destinos, r.tipo_destino, r.destino)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover roteamento de {r.numero}?</AlertDialogTitle>
                          <AlertDialogDescription>Não remove o número, apenas o roteamento.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(r.id)}>Remover</AlertDialogAction>
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
        <RoteamentoFormDialog tenantId={tenantId} item={editing} open onOpenChange={(v) => !v && setEditing(null)} />
      )}
    </div>
  );
}

function RoteamentoFormDialog({
  tenantId, item, open: co, onOpenChange,
}: { tenantId: number; item?: RoteamentoItem; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!item;

  const numerosFn = useServerFn(listNumeros);
  const { data: numData } = useQuery({
    queryKey: ["numeros", tenantId],
    queryFn: () => numerosFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const [numeroId, setNumeroId] = useState<string>(item?.numero_id ? String(item.numero_id) : "");
  const [dest, setDest] = useState<DestinoValue>(
    item ? parseDestinoFromBackend(item.tipo_destino, item.destino) : { ...emptyDestino },
  );

  useEffect(() => {
    if (open) {
      setNumeroId(item?.numero_id ? String(item.numero_id) : "");
      setDest(item ? parseDestinoFromBackend(item.tipo_destino, item.destino) : { ...emptyDestino });
    }
  }, [open, item]);

  const qc = useQueryClient();
  const createFn = useServerFn(createRoteamento);
  const updateFn = useServerFn(updateRoteamento);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        numero_id: Number(numeroId),
        tipo_destino: dest.tipo as Exclude<DestinoTipo, "INTERNO">,
        destino: buildDestinoForBackend(dest),
      };
      return editing
        ? updateFn({ data: { id: item!.id, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Roteamento atualizado" : "Roteamento criado");
      qc.invalidateQueries({ queryKey: ["roteamento", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = !numeroId || isDestinoIncomplete(dest);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo roteamento</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar roteamento" : "Novo roteamento"}</DialogTitle>
          <DialogDescription>Cada número aponta para um único destino.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Número *</Label>
            <Select value={numeroId} onValueChange={setNumeroId} disabled={editing}>
              <SelectTrigger><SelectValue placeholder="Selecione o número" /></SelectTrigger>
              <SelectContent>
                {(numData?.numeros ?? []).map((n) => (
                  <SelectItem key={n.id} value={String(n.id)}>{n.numero} {n.descricao ? `— ${n.descricao}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DestinoPicker
            tenantId={tenantId}
            value={dest}
            onChange={setDest}
            allow={ACOES_ROTEAMENTO}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={disabled || mut.isPending}>{mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
