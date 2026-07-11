import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ListOrdered, RefreshCw, Plus, Pencil, Trash2, Users } from "lucide-react";
import {
  listFilas, createFila, updateFila, deleteFila,
  getFilaMembros, listRamais,
  type Fila,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/filas")({
  head: () => ({ meta: [{ title: "Filas — Cliente — Painel PABX" }] }),
  component: FilasPage,
});

const STRATEGY_LABELS: Record<string, string> = {
  ringall: "Tocar Todos",
  linear: "Sequencial",
  rrmemory: "Sequencial (Atendida)",
  leastrecent: "Menos Recente",
  fewestcalls: "Menos Chamadas",
  random: "Aleatório",
};

function FilasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listFilas);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["filas", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const filas = data?.filas ?? [];
  const [membrosDe, setMembrosDe] = useState<Fila | null>(null);
  const [editing, setEditing] = useState<Fila | null>(null);
  const delFn = useServerFn(deleteFila);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Fila removida"); qc.invalidateQueries({ queryKey: ["filas", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListOrdered className="h-6 w-6" /> Filas</h1>
          <p className="text-sm text-muted-foreground">Gestão de filas de atendimento.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <FilaFormDialog tenantId={tenantId} />
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</div>}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead>Timeout</TableHead>
              <TableHead>Membros</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && filas.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhuma fila.</TableCell></TableRow>}
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.display_name}</TableCell>
                <TableCell>{f.description ?? "-"}</TableCell>
                <TableCell>{f.strategy ? (STRATEGY_LABELS[f.strategy] || f.strategy) : "-"}</TableCell>
                <TableCell>{f.timeout ?? "-"}</TableCell>
                <TableCell>{f.membros}</TableCell>
                <TableCell><Badge variant={f.active ? "default" : "secondary"}>{f.active ? "Sim" : "Não"}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setMembrosDe(f)}>
                      <Users className="h-4 w-4 mr-1" /> Ramais
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(f)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover fila {f.display_name}?</AlertDialogTitle>
                          <AlertDialogDescription>Remove membros e configuração da fila.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(f.id)}>Remover</AlertDialogAction>
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
      {membrosDe && <MembrosDialog tenantId={tenantId} fila={membrosDe} onClose={() => setMembrosDe(null)} />}
      {editing && <FilaFormDialog tenantId={tenantId} fila={editing} open onOpenChange={(v) => !v && setEditing(null)} />}
    </div>
  );
}

function MembrosDialog({ tenantId, fila, onClose }: { tenantId: number; fila: Fila; onClose: () => void }) {
  const fn = useServerFn(getFilaMembros);
  const { data, isLoading } = useQuery({
    queryKey: ["fila-membros", tenantId, fila.virtual_extension],
    queryFn: () => fn({ data: { tenant_id: tenantId, virtual_extension: fila.virtual_extension } }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fila.display_name} — Ramais / Agentes</DialogTitle>
          <DialogDescription>Monitor da fila {fila.virtual_extension}.</DialogDescription>
        </DialogHeader>
        {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>}
        {data && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome ramal</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Ramal</TableHead>
                  <TableHead>CallerID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.agentes ?? []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.nome_ramal}</TableCell>
                    <TableCell>{a.prioridade ?? "-"}</TableCell>
                    <TableCell className="font-mono">{a.ramal ?? "-"}</TableCell>
                    <TableCell>{a.callerid ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {(data.agentes ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Sem membros.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilaFormDialog({
  tenantId, fila, open: co, onOpenChange,
}: { tenantId: number; fila?: Fila; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!fila;

  const ramaisFn = useServerFn(listRamais);
  const { data: rd } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const membrosFn = useServerFn(getFilaMembros);
  const { data: mem } = useQuery({
    queryKey: ["fila-membros", tenantId, fila?.virtual_extension],
    queryFn: () => membrosFn({ data: { tenant_id: tenantId, virtual_extension: fila!.virtual_extension } }),
    enabled: open && editing,
  });

  const [form, setForm] = useState({
    virtual_extension: fila?.virtual_extension ?? "",
    display_name: fila?.display_name ?? "",
    description: fila?.description ?? "",
    strategy: (fila?.strategy as any) ?? "ringall",
    timeout: fila?.timeout ?? 15,
    active: fila?.active ?? true,
  });
  const [members, setMembers] = useState<{ nome_ramal: string; prioridade: number }[]>([]);

  useEffect(() => {
    if (open) {
      setForm({
        virtual_extension: fila?.virtual_extension ?? "",
        display_name: fila?.display_name ?? "",
        description: fila?.description ?? "",
        strategy: (fila?.strategy as any) ?? "ringall",
        timeout: fila?.timeout ?? 15,
        active: fila?.active ?? true,
      });
      setMembers([]);
    }
  }, [open, fila]);
  useEffect(() => {
    if (open && editing && mem?.agentes) {
      setMembers(mem.agentes.map((a: any) => ({ nome_ramal: a.nome_ramal, prioridade: a.prioridade || 1 })));
    }
  }, [open, editing, mem]);

  const qc = useQueryClient();
  const createFn = useServerFn(createFila);
  const updateFn = useServerFn(updateFila);
  const mut = useMutation({
    mutationFn: () => {
      const body: any = {
        tenant_id: tenantId,
        virtual_extension: form.virtual_extension,
        display_name: form.display_name,
        description: form.description,
        strategy: form.strategy,
        timeout: Number(form.timeout) || 0,
        active: form.active,
        ramais: members.filter((m) => m.nome_ramal),
      };
      return editing ? updateFn({ data: { id: fila!.id, ...body } }) : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Fila atualizada" : "Fila criada");
      qc.invalidateQueries({ queryKey: ["filas", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ramais = rd?.ramais ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova fila</Button></DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar fila ${fila!.display_name}` : "Nova fila"}</DialogTitle>
          <DialogDescription>Configuração de fila e membros.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required maxLength={120} />
          </div>
          <div className="space-y-1"><Label>Descrição</Label>
            <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={255} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label>Estratégia</Label>
              <Select value={form.strategy} onValueChange={(v: any) => setForm({ ...form, strategy: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a estratégia" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STRATEGY_LABELS).map(([value, label]) => ( 
                    <SelectItem key={value} value={value}>
                      {label}
                   </SelectItem>
                 ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Timeout (s)</Label>
              <Input type="number" min={0} max={3600} value={form.timeout ?? 0}
                     onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })} />
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              Ativa
            </label>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Membros</div>
              <Button type="button" variant="outline" size="sm"
                      onClick={() => setMembers([...members, { nome_ramal: "", prioridade: (members.length + 1) }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            {members.length === 0 && <div className="text-xs text-muted-foreground">Nenhum membro.</div>}
            {members.map((m, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_100px_36px] gap-2 items-center">
                <Select value={m.nome_ramal}
                        onValueChange={(v) => setMembers(members.map((x, i) => i === idx ? { ...x, nome_ramal: v } : x))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o ramal" /></SelectTrigger>
                  <SelectContent>
                    {ramais.map((r) => (
                      <SelectItem key={r.id} value={r.nome ?? String(r.ramal)}>
                        {(r.nome ?? "(sem nome)")} — {r.ramal}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} max={100} value={m.prioridade}
                       onChange={(e) => setMembers(members.map((x, i) => i === idx ? { ...x, prioridade: Number(e.target.value) } : x))} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setMembers(members.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !form.display_name || !form.virtual_extension}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
