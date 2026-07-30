import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ListOrdered, RefreshCw, Plus, Pencil, Trash2, Users } from "lucide-react";
import { RecordingBadge } from "@/components/recording-badge";
import {
  listFilas, createFila, updateFila, deleteFila,
  getFilaAgentes, addFilaAgente, removeFilaAgente, setFilaAgentePenalty,
  listRamais,
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
  const [agentesDe, setAgentesDe] = useState<Fila | null>(null);
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
              <TableHead>Timeout Agente</TableHead>
              <TableHead>Timeout Fila</TableHead>
              <TableHead>Agentes</TableHead>
              <TableHead>Gravação</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && filas.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma fila.</TableCell></TableRow>}
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.display_name}</TableCell>
                <TableCell>{f.description ?? "-"}</TableCell>
                <TableCell>{f.strategy ? (STRATEGY_LABELS[f.strategy] || f.strategy) : "-"}</TableCell>
                <TableCell>{f.timeout ?? "-"}</TableCell>
                <TableCell>{f.fila_timeout ?? "-"}</TableCell>
                <TableCell>{f.membros}</TableCell>
                <TableCell><RecordingBadge state={f.gravacao} showLabel /></TableCell>
                <TableCell><Badge variant={f.active ? "default" : "secondary"}>{f.active ? "Sim" : "Não"}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setAgentesDe(f)}>
                      <Users className="h-4 w-4 mr-1" /> Agentes
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(f)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover fila {f.display_name}?</AlertDialogTitle>
                          <AlertDialogDescription>Remove os agentes e a configuração da fila.</AlertDialogDescription>
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
      {agentesDe && <AgentesDialog tenantId={tenantId} fila={agentesDe} onClose={() => setAgentesDe(null)} />}
      {editing && <FilaFormDialog tenantId={tenantId} fila={editing} open onOpenChange={(v) => !v && setEditing(null)} />}
    </div>
  );
}

function AgentesDialog({ tenantId, fila, onClose }: { tenantId: number; fila: Fila; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getFilaAgentes);
  const { data, isLoading } = useQuery({
    queryKey: ["fila-agentes", tenantId, fila.id],
    queryFn: () => fn({ data: { tenant_id: tenantId, fila_id: fila.id } }),
  });

  const ramaisFn = useServerFn(listRamais);
  const { data: rd } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
  });
  const ramais = rd?.ramais ?? [];

  const [novoRamal, setNovoRamal] = useState("");
  const [novaPrioridade, setNovaPrioridade] = useState(0);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["fila-agentes", tenantId, fila.id] });
    qc.invalidateQueries({ queryKey: ["filas", tenantId] });
  }

  const addFn = useServerFn(addFilaAgente);
  const addMut = useMutation({
    mutationFn: () => addFn({ data: { tenant_id: tenantId, fila_id: fila.id, ramal: novoRamal, penalty: novaPrioridade } }),
    onSuccess: () => {
      toast.success("Agente adicionado");
      invalidateAll();
      setNovoRamal("");
      setNovaPrioridade(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFn = useServerFn(removeFilaAgente);
  const removeMut = useMutation({
    mutationFn: (agenteId: string) => removeFn({ data: { tenant_id: tenantId, agente_id: agenteId } }),
    onSuccess: () => { toast.success("Agente removido"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const penaltyFn = useServerFn(setFilaAgentePenalty);
  const penaltyMut = useMutation({
    mutationFn: (vars: { agenteId: string; penalty: number }) =>
      penaltyFn({ data: { tenant_id: tenantId, agente_id: vars.agenteId, penalty: vars.penalty } }),
    onSuccess: () => { toast.success("Prioridade atualizada"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const agentes = data?.agentes ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fila.display_name} — Agentes</DialogTitle>
          <DialogDescription>Alterações aqui têm efeito imediato na fila (via AMI).</DialogDescription>
        </DialogHeader>

        {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ramal</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-28">Prioridade</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.ramal ?? "-"}</TableCell>
                    <TableCell>{a.membername ?? "-"}</TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} max={100} defaultValue={a.penalty ?? 0}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== (a.penalty ?? 0)) penaltyMut.mutate({ agenteId: a.id, penalty: v });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeMut.mutate(a.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {agentes.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Sem agentes.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium">Adicionar agente</div>
          <div className="grid grid-cols-[1fr_100px_36px] gap-2 items-center">
            <Select value={novoRamal} onValueChange={setNovoRamal}>
              <SelectTrigger><SelectValue placeholder="Selecione o ramal" /></SelectTrigger>
              <SelectContent>
                {ramais.map((r) => (
                  <SelectItem key={r.id} value={String(r.ramal)}>
                    {(r.nome ?? "(sem nome)")} — {r.ramal}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={0} max={100} value={novaPrioridade}
                   onChange={(e) => setNovaPrioridade(Number(e.target.value))} />
            <Button type="button" size="icon" disabled={!novoRamal || addMut.isPending} onClick={() => addMut.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
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

  const [form, setForm] = useState({
    display_name: fila?.display_name ?? "",
    description: fila?.description ?? "",
    strategy: (fila?.strategy as string) ?? "ringall",
    timeout: fila?.timeout ?? 15,
    retry: fila?.retry ?? 5,
    fila_timeout: fila?.fila_timeout ?? 30,
    gravacao: fila?.gravacao ?? false,
    active: fila?.active ?? true,
  });

  useEffect(() => {
    if (open) {
      setForm({
        display_name: fila?.display_name ?? "",
        description: fila?.description ?? "",
        strategy: (fila?.strategy as string) ?? "ringall",
        timeout: fila?.timeout ?? 15,
        retry: fila?.retry ?? 5,
        fila_timeout: fila?.fila_timeout ?? 30,
        gravacao: fila?.gravacao ?? false,
        active: fila?.active ?? true,
      });
    }
  }, [open, fila]);

  const qc = useQueryClient();
  const createFn = useServerFn(createFila);
  const updateFn = useServerFn(updateFila);
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        display_name: form.display_name,
        description: form.description,
        strategy: form.strategy as "ringall" | "rrmemory" | "leastrecent" | "fewestcalls" | "random",
        timeout: Number(form.timeout) || 0,
        fila_timeout: Number(form.fila_timeout) || 0,
        retry: Number(form.retry) || 0,
        gravacao: form.gravacao,
        active: form.active,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova fila</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar fila ${fila!.display_name}` : "Nova fila"}</DialogTitle>
          <DialogDescription>
            {editing ? "Configuração da fila." : 'Depois de criar, adicione os agentes pelo botão "Agentes".'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nome *</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required maxLength={120} />
          </div>
          <div className="space-y-1"><Label>Descrição</Label>
            <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={255} />
          </div>
          <div className="space-y-1">
            <Label>Estratégia</Label>
              <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a estratégia" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STRATEGY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full flex items-center gap-2 rounded-md border p-3">
              <Switch checked={form.gravacao} onCheckedChange={(v) => setForm({ ...form, gravacao: v })} />
            <div>
              <p className="font-medium text-sm">Gravar chamadas</p>
              <p className="text-xs text-muted-foreground">
                Grava automaticamente as conversas que passarem por esta fila.
               </p>
              </div>
             </div>
             <div className="w-full flex items-center gap-2 rounded-md border p-3">
               <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
             <div>
              <p className="font-medium text-sm">Fila Ativa</p>
              <p className="text-xs text-muted-foreground">
                Define se a fila está habilitada para receber ligações no momento.
               </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 border-t pt-3">
            <div className="space-y-1"><Label title="Tempo de toque máximo no agente">Timeout Agente</Label>
              <Input type="number" min={0} max={3600} placeholder="15" value={form.timeout === null || form.timeout === undefined ? "" : form.timeout}
                     onChange={(e) => setForm({ ...form, timeout: e.target.value == "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1"><Label title="Tempo de espera para rediscar no Agente">Intervalo (s)</Label>
            <Input type="number" min={0} max={3600} placeholder="5" value={form.retry === null || form.retry === undefined ? "" : form.retry}
                   onChange={(e) => setForm({ ...form, retry: e.target.value == "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1"><Label title="Tempo máximo da fila">Timeout fila</Label>
            <Input type="number" min={0} max={86400} placeholder="30" value={form.fila_timeout === null || form.fila_timeout === undefined ? "" : form.fila_timeout}
                   onChange={(e) => setForm({ ...form, fila_timeout: e.target.value == "" ? null :Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !form.display_name}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
