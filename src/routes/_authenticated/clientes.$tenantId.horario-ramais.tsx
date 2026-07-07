import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, RefreshCw, Plus, Pencil, Trash2, ListTree } from "lucide-react";
import {
  listHorarioRamais, createHorarioRamal, updateHorarioRamal,
  deleteHorarioRamal, getHorarioRamalMembros, listRamais,
  type HorarioRamal,
} from "@/lib/ramais.functions";
import { displayFromBackend } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/horario-ramais")({
  head: () => ({ meta: [{ title: "Horário para ramais — Painel PABX" }] }),
  component: Page,
});

const DIAS = [
  { key: "mon", label: "Seg" }, { key: "tue", label: "Ter" }, { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" }, { key: "fri", label: "Sex" }, { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
] as const;
const DIA_FULL: Record<string, string> = {
  mon: "Segunda", tue: "Terça", wed: "Quarta", thu: "Quinta",
  fri: "Sexta", sat: "Sábado", sun: "Domingo",
};
const fmtDias = (d: string) => d.split("&").map((x) => DIA_FULL[x] ?? x).join(", ");
const parseDias = (d: string) => d.split("&").map((s) => s.trim().toLowerCase()).filter(Boolean);
const trimTime = (t: string) => (t || "").slice(0, 5);

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const qc = useQueryClient();
  const fn = useServerFn(listHorarioRamais);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["horario-ramais", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const regras = data?.regras ?? [];

  const [editing, setEditing] = useState<HorarioRamal | null>(null);
  const [viewMembers, setViewMembers] = useState<HorarioRamal | null>(null);

  const delFn = useServerFn(deleteHorarioRamal);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Regra removida"); qc.invalidateQueries({ queryKey: ["horario-ramais", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Horário para Ramais</h1>
          <p className="text-sm text-muted-foreground">Define o horário em que cada ramal pode receber/originar chamadas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <HorarioRamalDialog tenantId={tenantId} />
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
              <TableHead>Ramais</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && regras.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhuma regra.</TableCell></TableRow>}
            {regras.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{displayFromBackend(r.nome)}</TableCell>
                <TableCell className="text-xs">{fmtDias(r.dias)}</TableCell>
                <TableCell className="font-mono text-xs">{trimTime(r.hora_inicial)} → {trimTime(r.hora_final)}</TableCell>
                <TableCell><Badge variant="secondary">{r.membros}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setViewMembers(r)}>
                      <ListTree className="h-4 w-4 mr-1" /> Ver ramais
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover regra "{displayFromBackend(r.nome)}"?</AlertDialogTitle>
                          <AlertDialogDescription>Remove também os ramais vinculados a esta regra.</AlertDialogDescription>
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
        <HorarioRamalDialog key={editing.id} tenantId={tenantId} regra={editing} open onOpenChange={(v) => !v && setEditing(null)} />
      )}
      {viewMembers && (
        <MembrosDialog tenantId={tenantId} regra={viewMembers} onClose={() => setViewMembers(null)} />
      )}
    </div>
  );
}

function MembrosDialog({ tenantId, regra, onClose }: { tenantId: number; regra: HorarioRamal; onClose: () => void }) {
  const fn = useServerFn(getHorarioRamalMembros);
  const { data, isLoading } = useQuery({
    queryKey: ["horario-ramais-membros", tenantId, regra.id],
    queryFn: () => fn({ data: { id: regra.id, tenant_id: tenantId } }),
  });
  const membros = data?.membros ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{displayFromBackend(regra.nome)} — Ramais</DialogTitle>
          <DialogDescription>Ramais vinculados a esta regra.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : membros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem ramais.</p>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-auto">
            {membros.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                <span>{displayFromBackend(m.nome ?? "")}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.ramal}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HorarioRamalDialog({
  tenantId, regra, open: co, onOpenChange,
}: { tenantId: number; regra?: HorarioRamal; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = co ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!regra;

  const [nome, setNome] = useState(regra?.nome ?? "");
  const [dias, setDias] = useState<string[]>(regra ? parseDias(regra.dias) : []);
  const [horaIni, setHoraIni] = useState(trimTime(regra?.hora_inicial ?? "08:00"));
  const [horaFim, setHoraFim] = useState(trimTime(regra?.hora_final ?? "18:00"));
  const [ramaisSel, setRamaisSel] = useState<string[]>([]);

  const ramaisFn = useServerFn(listRamais);
  const { data: ramaisData } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const membrosFn = useServerFn(getHorarioRamalMembros);
  const { data: membrosData } = useQuery({
    queryKey: ["horario-ramais-membros", tenantId, regra?.id],
    queryFn: () => membrosFn({ data: { id: regra!.id, tenant_id: tenantId } }),
    enabled: open && editing,
  });

  useEffect(() => {
    if (open) {
      setNome(regra?.nome ?? "");
      setDias(regra ? parseDias(regra.dias) : []);
      setHoraIni(trimTime(regra?.hora_inicial ?? "08:00"));
      setHoraFim(trimTime(regra?.hora_final ?? "18:00"));
      if (!editing) setRamaisSel([]);
    }
  }, [open, regra, editing]);

  useEffect(() => {
    if (open && editing && membrosData) {
      setRamaisSel(membrosData.membros.map((m) => m.ramal));
    }
  }, [open, editing, membrosData]);

  const qc = useQueryClient();
  const createFn = useServerFn(createHorarioRamal);
  const updateFn = useServerFn(updateHorarioRamal);
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        nome, dias: dias.join("&"),
        hora_inicial: horaIni, hora_final: horaFim,
        ramais: ramaisSel,
      };
      return editing
        ? updateFn({ data: { id: regra!.id, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["horario-ramais", tenantId] });
      qc.invalidateQueries({ queryKey: ["horario-ramais-membros", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDia = (d: string, v: boolean) =>
    setDias((s) => (v ? [...s, d] : s.filter((x) => x !== d)));
  const toggleRamal = (r: string, v: boolean) =>
    setRamaisSel((s) => (v ? [...s, r] : s.filter((x) => x !== r)));

  const canSubmit = !!nome && dias.length > 0 && horaIni && horaFim;
  const ramais = ramaisData?.ramais ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova regra</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          <DialogDescription>Define horário e ramais vinculados.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={100} />
          </div>

          <div className="space-y-1">
            <Label>Dias *</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {DIAS.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={dias.includes(d.key)} onCheckedChange={(v) => toggleDia(d.key, !!v)} />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Hora inicial *</Label>
              <Input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Hora final *</Label>
              <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Ramais</Label>
            <div className="rounded-md border max-h-56 overflow-auto p-2 space-y-1">
              {ramais.length === 0 && <p className="text-xs text-muted-foreground">Sem ramais cadastrados.</p>}
              {ramais.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 hover:bg-accent rounded">
                  <Checkbox
                    checked={ramaisSel.includes(r.ramal)}
                    onCheckedChange={(v) => toggleRamal(r.ramal, !!v)}
                  />
                  <span className="font-mono text-xs w-14">{r.ramal}</span>
                  <span className="flex-1">{displayFromBackend(r.nome ?? "")}</span>
                </label>
              ))}
            </div>
          </div>

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
