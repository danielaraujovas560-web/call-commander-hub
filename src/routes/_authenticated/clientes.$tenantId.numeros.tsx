import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Hash, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listNumeros, createNumero, updateNumero, deleteNumero,
  type NumeroItem,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/numeros")({
  head: () => ({ meta: [{ title: "Números — Cliente — Painel PABX" }] }),
  component: NumerosPage,
});

function NumerosPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listNumeros);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["numeros", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const numeros = data?.numeros ?? [];
  const [editing, setEditing] = useState<NumeroItem | null>(null);
  const delFn = useServerFn(deleteNumero);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Número removido"); qc.invalidateQueries({ queryKey: ["numeros", tenantId] }); qc.invalidateQueries({ queryKey: ["roteamento", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Hash className="h-6 w-6" /> Números</h1>
          <p className="text-sm text-muted-foreground">DIDs cadastrados para este cliente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <NumeroFormDialog tenantId={tenantId} />
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</div>}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={3} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && numeros.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">Nenhum número.</TableCell></TableRow>}
            {numeros.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono">{n.numero}</TableCell>
                <TableCell>{n.descricao ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(n)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover número {n.numero}?</AlertDialogTitle>
                          <AlertDialogDescription>Também remove seu roteamento (cascata).</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(n.id)}>Remover</AlertDialogAction>
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
        <NumeroFormDialog tenantId={tenantId} numero={editing} open onOpenChange={(v) => !v && setEditing(null)} />
      )}
    </div>
  );
}

function NumeroFormDialog({ tenantId, numero, open: co, onOpenChange }: { tenantId: number; numero?: NumeroItem; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!numero;
  const [form, setForm] = useState({ numero: numero?.numero ?? "", descricao: numero?.descricao ?? "" });
  useEffect(() => {
    if (open) setForm({ numero: numero?.numero ?? "", descricao: numero?.descricao ?? "" });
  }, [open, numero]);
  const qc = useQueryClient();
  const createFn = useServerFn(createNumero);
  const updateFn = useServerFn(updateNumero);
  const mut = useMutation({
    mutationFn: () =>
      editing
        ? updateFn({ data: { id: numero!.id, tenant_id: tenantId, numero: form.numero, descricao: form.descricao } })
        : createFn({ data: { tenant_id: tenantId, numero: form.numero, descricao: form.descricao } }),
    onSuccess: () => {
      toast.success(editing ? "Número atualizado" : "Número criado");
      qc.invalidateQueries({ queryKey: ["numeros", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo número</Button></DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar número" : "Novo número"}</DialogTitle>
          <DialogDescription>DID que chega no tenant.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Número *</Label>
            <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required maxLength={20} />
          </div>
          <div className="space-y-1"><Label>Descrição</Label>
            <Input value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={255} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !form.numero}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
