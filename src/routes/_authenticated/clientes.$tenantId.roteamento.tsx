import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Router as RouterIcon, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listRoteamento, createRoteamento, updateRoteamento, deleteRoteamento,
  listNumeros, listUraDestinos,
  type RoteamentoItem,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type TipoDest = "RAMAL" | "FILA" | "URA" | "EXTERNO";

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

  function renderDest(r: RoteamentoItem) {
    if (r.tipo_destino === "FILA") return destinos?.filas.find((f) => String(f.value) === r.destino)?.label ?? r.destino;
    if (r.tipo_destino === "URA") return destinos?.uras.find((u) => String(u.value) === r.destino)?.label ?? r.destino;
    if (r.tipo_destino === "RAMAL") return destinos?.ramais.find((x) => String(x.value) === r.destino)?.label ?? r.destino;
    return r.destino;
  }

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
                <TableCell>{renderDest(r)}</TableCell>
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
  const destinosFn = useServerFn(listUraDestinos);
  const { data: destinos } = useQuery({
    queryKey: ["ura-destinos", tenantId],
    queryFn: () => destinosFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const [form, setForm] = useState<{
    numero_id: string;
    tipo_destino: TipoDest | "";
    destino: string;
    externoNumero: string;
    externoTronco: string;
  }>({
    numero_id: item?.numero_id ? String(item.numero_id) : "",
    tipo_destino: (item?.tipo_destino as TipoDest) ?? "",
    destino: item?.destino ?? "",
    externoNumero: "",
    externoTronco: "",
  });

  useEffect(() => {
    if (open) {
      if (item) {
        let externoNumero = "", externoTronco = "";
        if (item.tipo_destino === "EXTERNO" && item.destino.includes("/")) {
          const [n, t] = item.destino.split("/");
          externoNumero = n; externoTronco = t;
        }
        setForm({
          numero_id: String(item.numero_id),
          tipo_destino: item.tipo_destino as TipoDest,
          destino: item.destino,
          externoNumero, externoTronco,
        });
      } else {
        setForm({ numero_id: "", tipo_destino: "", destino: "", externoNumero: "", externoTronco: "" });
      }
    }
  }, [open, item]);

  const qc = useQueryClient();
  const createFn = useServerFn(createRoteamento);
  const updateFn = useServerFn(updateRoteamento);

  const mut = useMutation({
    mutationFn: () => {
      const destino = form.tipo_destino === "EXTERNO"
        ? `${form.externoNumero}/${form.externoTronco}`
        : form.destino;
      const body: any = {
        tenant_id: tenantId,
        numero_id: Number(form.numero_id),
        tipo_destino: form.tipo_destino as TipoDest,
        destino,
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

  const disabled = !form.numero_id || !form.tipo_destino ||
    (form.tipo_destino === "EXTERNO"
      ? !form.externoNumero || !form.externoTronco
      : !form.destino);

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
            <Select value={form.numero_id} onValueChange={(v) => setForm({ ...form, numero_id: v })} disabled={editing}>
              <SelectTrigger><SelectValue placeholder="Selecione o número" /></SelectTrigger>
              <SelectContent>
                {(numData?.numeros ?? []).map((n) => (
                  <SelectItem key={n.id} value={String(n.id)}>{n.numero} {n.descricao ? `— ${n.descricao}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Tipo *</Label>
            <Select value={form.tipo_destino} onValueChange={(v: any) => setForm({ ...form, tipo_destino: v, destino: "" })}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RAMAL">Ramal</SelectItem>
                <SelectItem value="FILA">Fila</SelectItem>
                <SelectItem value="URA">URA</SelectItem>
                <SelectItem value="EXTERNO">Externo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Destino *</Label>
            {form.tipo_destino === "RAMAL" && (
              <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o ramal" /></SelectTrigger>
                <SelectContent>
                  {destinos?.ramais.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label} ({r.value})</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {form.tipo_destino === "FILA" && (
              <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a fila" /></SelectTrigger>
                <SelectContent>
                  {destinos?.filas.map((f) => <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {form.tipo_destino === "URA" && (
              <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a URA" /></SelectTrigger>
                <SelectContent>
                  {destinos?.uras.map((u) => <SelectItem key={u.value} value={String(u.value)}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {form.tipo_destino === "EXTERNO" && (
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.externoNumero} onChange={(e) => setForm({ ...form, externoNumero: e.target.value })} placeholder="Número" />
                <Select value={form.externoTronco} onValueChange={(v) => setForm({ ...form, externoTronco: v })}>
                  <SelectTrigger><SelectValue placeholder="Tronco" /></SelectTrigger>
                  <SelectContent>
                    {destinos?.troncos.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!form.tipo_destino && <Input disabled placeholder="Escolha o tipo primeiro" />}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={disabled || mut.isPending}>{mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
