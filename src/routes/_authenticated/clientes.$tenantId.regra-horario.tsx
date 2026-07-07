import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listRegraHorario, createRegraHorario, updateRegraHorario, deleteRegraHorario,
  listUraDestinos,
  type RegraHorario, type AcaoHorario,
} from "@/lib/ramais.functions";
import {
  DestinoPicker, emptyDestino, parseDestinoFromBackend, buildDestinoForBackend,
  isDestinoIncomplete, renderDestinoLabel,
  type DestinoValue, type DestinoTipo,
} from "@/components/destino-picker";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/regra-horario")({
  head: () => ({ meta: [{ title: "Horário de atendimento — Painel PABX" }] }),
  component: Page,
});

const DIAS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
] as const;

const DIA_FULL: Record<string, string> = {
  mon: "Segunda", tue: "Terça", wed: "Quarta", thu: "Quinta",
  fri: "Sexta", sat: "Sábado", sun: "Domingo",
};
function formatDias(dias: string): string {
  return dias.split("&").map((d) => DIA_FULL[d.trim().toLowerCase()] ?? d).join(", ");
}

// Regra de horário aceita ações "terminais" (não outra HORARIO_ATENDIMENTO para
// evitar recursão) — mesmo conjunto do backend ENUM `acao_dentro/acao_fora`.
const ACOES_REGRA: readonly DestinoTipo[] = ["RAMAL", "FILA", "URA", "EXTERNO", "INTERNO", "AUDIO"];


function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listRegraHorario);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["regra_horario", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const regras = data?.regras ?? [];
  const [editing, setEditing] = useState<RegraHorario | null>(null);
  const delFn = useServerFn(deleteRegraHorario);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Regra removida"); qc.invalidateQueries({ queryKey: ["regra_horario", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6" /> Horário de Atendimento Personalizado</h1>
          <p className="text-sm text-muted-foreground">Regras de horário e destinos dentro/fora do expediente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <RegraFormDialog tenantId={tenantId} />
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</div>}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Dentro</TableHead>
              <TableHead>Fora</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && regras.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhuma regra.</TableCell></TableRow>}
            {regras.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell className="text-xs">{formatDias(r.dias)}</TableCell>
                <TableCell className="font-mono text-xs">{r.hora_inicial} → {r.hora_final}</TableCell>
                <TableCell><Badge variant="default">{r.acao_dentro}</Badge> <span className="font-mono text-xs ml-1">{r.destino_dentro}</span></TableCell>
                <TableCell><Badge variant="secondary">{r.acao_fora}</Badge> <span className="font-mono text-xs ml-1">{r.destino_fora}</span></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover regra "{r.nome}"?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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
        <RegraFormDialog key={editing.id} tenantId={tenantId} regra={editing} open onOpenChange={(v) => !v && setEditing(null)} />
      )}
    </div>
  );
}

function parseDias(dias: string): string[] {
  return dias.split("&").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function trimTime(t: string): string {
  return (t || "").slice(0, 5);
}

function RegraFormDialog({
  tenantId, regra, open: co, onOpenChange,
}: { tenantId: number; regra?: RegraHorario; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!regra;

  const [form, setForm] = useState(() => ({
    nome: regra?.nome ?? "",
    dias: regra ? parseDias(regra.dias) : [] as string[],
    hora_inicial: trimTime(regra?.hora_inicial ?? "08:00"),
    hora_final: trimTime(regra?.hora_final ?? "18:00"),
    acao_dentro: (regra?.acao_dentro ?? "URA") as AcaoHorario,
    destino_dentro: regra?.destino_dentro ?? "",
    acao_fora: (regra?.acao_fora ?? "INTERNO") as AcaoHorario,
    destino_fora: regra?.destino_fora ?? "desligar",
  }));

  useEffect(() => {
    if (open) {
      setForm({
        nome: regra?.nome ?? "",
        dias: regra ? parseDias(regra.dias) : [],
        hora_inicial: trimTime(regra?.hora_inicial ?? "08:00"),
        hora_final: trimTime(regra?.hora_final ?? "18:00"),
        acao_dentro: (regra?.acao_dentro ?? "URA") as AcaoHorario,
        destino_dentro: regra?.destino_dentro ?? "",
        acao_fora: (regra?.acao_fora ?? "INTERNO") as AcaoHorario,
        destino_fora: regra?.destino_fora ?? "desligar",
      });
    }
  }, [open, regra]);

  const qc = useQueryClient();
  const createFn = useServerFn(createRegraHorario);
  const updateFn = useServerFn(updateRegraHorario);
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        nome: form.nome,
        dias: form.dias.join("&"),
        hora_inicial: form.hora_inicial,
        hora_final: form.hora_final,
        acao_dentro: form.acao_dentro,
        destino_dentro: form.destino_dentro,
        acao_fora: form.acao_fora,
        destino_fora: form.destino_fora,
      };
      return editing
        ? updateFn({ data: { id: regra!.id, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["regra_horario", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDia = (d: string, checked: boolean) => {
    setForm((s) => ({
      ...s,
      dias: checked ? [...s.dias, d] : s.dias.filter((x) => x !== d),
    }));
  };

  const canSubmit = form.nome && form.dias.length > 0 && form.destino_dentro && form.destino_fora;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova regra</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar regra" : "Nova regra de horário"}</DialogTitle>
          <DialogDescription>Define destino dentro e fora do expediente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required maxLength={100} />
          </div>

          <div className="space-y-1">
            <Label>Dias *</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {DIAS.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.dias.includes(d.key)}
                    onCheckedChange={(v) => toggleDia(d.key, !!v)}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Hora inicial *</Label>
              <Input type="time" value={form.hora_inicial} onChange={(e) => setForm({ ...form, hora_inicial: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Hora final *</Label>
              <Input type="time" value={form.hora_final} onChange={(e) => setForm({ ...form, hora_final: e.target.value })} required />
            </div>
          </div>

          <fieldset className="rounded-md border p-3 space-y-2">
            <legend className="px-1 text-xs font-medium">Dentro do horário</legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Ação</Label>
                <select className="flex h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  value={form.acao_dentro}
                  onChange={(e) => setForm({ ...form, acao_dentro: e.target.value as AcaoHorario })}>
                  {ACOES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Destino</Label>
                <Input value={form.destino_dentro} onChange={(e) => setForm({ ...form, destino_dentro: e.target.value })} maxLength={100} />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-md border p-3 space-y-2">
            <legend className="px-1 text-xs font-medium">Fora do horário</legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Ação</Label>
                <select className="flex h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  value={form.acao_fora}
                  onChange={(e) => setForm({ ...form, acao_fora: e.target.value as AcaoHorario })}>
                  {ACOES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Destino</Label>
                <Input value={form.destino_fora} onChange={(e) => setForm({ ...form, destino_fora: e.target.value })} maxLength={100} />
              </div>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !canSubmit}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
