import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, RefreshCw, Plus, Pencil, Trash2, Search, Loader2, Video, Mic } from "lucide-react";
import { FieldHelp } from "@/components/field-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ManagementDialogContent as DialogContent,
  ManagementDialogHeader as DialogHeader,
  ManagementDialogFooter as DialogFooter,
} from "@/components/ui/management-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useClienteContext } from "@/context/cliente-context";
import { listConferencias, createConferencia, updateConferencia, deleteConferencia, type ConferenciaItem, type ConferenciaInput } from "@/lib/conferencias.functions";

export const Route = createFileRoute("/_authenticated/cliente/conferencias")({
  head: () => ({ meta: [{ title: "Conferências — Cliente — Painel PABX" }] }),
  component: ConferenciasPage,
});

const flag = (value: number | boolean) => value === true || Number(value) === 1;
const defaults: ConferenciaInput = {
  nome: "", ramal: "", max_participantes: 20, gravar: false,
  mixing_interval: 20, permitir_video: false, ativo: true,
};

function ConferenciasPage() {
  const { tenantId } = useClienteContext();
  const qc = useQueryClient();
  const fn = useServerFn(listConferencias);
  const delFn = useServerFn(deleteConferencia);
  const [busca, setBusca] = useState("");
  const [editing, setEditing] = useState<ConferenciaItem | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["conferencias", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });
  const rows = data?.conferencias ?? [];
  const filtradas = rows.filter((r) =>
    `${r.nome} ${r.ramal} ${r.tipo}`.toLowerCase().includes(busca.trim().toLowerCase()),
  );
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { tenant_id: tenantId, id } }),
    onSuccess: () => { toast.success("Conferência removida"); void qc.invalidateQueries({ queryKey: ["conferencias", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MessagesSquare className="h-6 w-6" /> Conferências</h1>
          <p className="text-sm text-muted-foreground">Gerencie as salas fixas do cliente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" title="Atualizar conferências" aria-label="Atualizar conferências" disabled={!tenantId || isFetching} onClick={() => void refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {!!tenantId && <ConferenciaFormDialog tenantId={tenantId} />}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Salas cadastradas" value={rows.length} icon={<MessagesSquare className="h-8 w-8 text-muted-foreground" />} />
        <Metric label="Salas ativas" value={rows.filter((r) => flag(r.ativo)).length} icon={<Mic className="h-8 w-8 text-muted-foreground" />} />
        <Metric label="Com gravação" value={rows.filter((r) => flag(r.gravar)).length} icon={<Video className="h-8 w-8 text-muted-foreground" />} />
      </div>
      <Card>
        <CardHeader className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle>Salas de conferência</CardTitle><CardDescription>Configurações persistentes cadastradas no PABX.</CardDescription></div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, ramal ou tipo…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Falha ao listar conferências: {(error as Error).message}
              <Button className="ml-2" size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Nome</TableHead><TableHead>Ramal</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Participantes</TableHead><TableHead>Gravação</TableHead><TableHead>Vídeo</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {!tenantId || isLoading ? (
                    <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">{isLoading && <Loader2 className="h-4 w-4 animate-spin" />}{!tenantId ? "Aguardando identificação do cliente…" : "Carregando…"}</span>
                    </TableCell></TableRow>
                  ) : filtradas.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      {busca ? "Nenhuma conferência encontrada para esta busca." : "Nenhuma conferência cadastrada."}
                    </TableCell></TableRow>
                  ) : filtradas.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="font-mono">{r.ramal}</TableCell>
                      <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                      <TableCell>{r.max_participantes}</TableCell>
                      <TableCell><Badge variant={flag(r.gravar) ? "default" : "secondary"}>{flag(r.gravar) ? "Sim" : "Não"}</Badge></TableCell>
                      <TableCell><Badge variant={flag(r.permitir_video) ? "default" : "secondary"}>{flag(r.permitir_video) ? "Sim" : "Não"}</Badge></TableCell>
                      <TableCell><Badge variant={flag(r.ativo) ? "default" : "secondary"}>{flag(r.ativo) ? "Ativa" : "Inativa"}</Badge></TableCell>
                      <TableCell className="text-right">
                        { String(r.tipo).toLowerCase() === "interna" && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Editar conferência" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" title="Excluir conferência"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Excluir {r.nome}?</AlertDialogTitle><AlertDialogDescription>Esta ação remove o cadastro da sala {r.ramal}. Não encerra automaticamente uma chamada em andamento.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={delMut.isPending} onClick={() => delMut.mutate(r.id)}>{delMut.isPending ? "Excluindo…" : "Excluir"}</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && !error && rows.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Exibindo {filtradas.length} de {rows.length} conferências.</p>}
        </CardContent>
      </Card>
      {editing && <ConferenciaFormDialog tenantId={tenantId} item={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} />}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Card><CardContent className="flex items-center justify-between p-4 pt-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{value}</p></div>{icon}</CardContent></Card>;
}

function ConferenciaFormDialog({ tenantId, item, open: controlledOpen, onOpenChange }: {
  tenantId: number; item?: ConferenciaItem; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => onOpenChange ? onOpenChange(next) : setInternalOpen(next);
  const editing = !!item;
  const [form, setForm] = useState<ConferenciaInput>(defaults);
  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      nome: item.nome, ramal: String(item.ramal), max_participantes: Number(item.max_participantes),
      gravar: flag(item.gravar), mixing_interval: Number(item.mixing_interval),
      permitir_video: flag(item.permitir_video), ativo: flag(item.ativo),
    } : { ...defaults });
  }, [open, item]);
  const qc = useQueryClient();
  const createFn = useServerFn(createConferencia);
  const updateFn = useServerFn(updateConferencia);
  const mut = useMutation({
    mutationFn: () => editing
      ? updateFn({ data: { tenant_id: tenantId, id: item.id, ...form } })
      : createFn({ data: { tenant_id: tenantId, ...form } }),
    onSuccess: () => {
      toast.success(editing ? "Conferência atualizada" : "Conferência criada");
      void qc.invalidateQueries({ queryKey: ["conferencias", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = <K extends keyof ConferenciaInput>(key: K, value: ConferenciaInput[K]) => setForm((old) => ({ ...old, [key]: value }));
  const valid = form.nome.trim().length > 0 && /^\d{1,20}$/.test(form.ramal) &&
    Number.isInteger(form.max_participantes) && form.max_participantes >= 2 && form.max_participantes <= 1000 &&
    Number.isInteger(form.mixing_interval) && form.mixing_interval >= 10 && form.mixing_interval <= 1000;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova conferência</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar conferência" : "Nova conferência"}</DialogTitle>
          <DialogDescription>Configurações da sala de conferência interna.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !mut.isPending) mut.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conf-nome">Nome *</Label>
              <Input id="conf-nome" maxLength={120} value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Sala comercial" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf-ramal">Ramal *</Label>
              <Input id="conf-ramal" inputMode="numeric" className="font-mono" value={form.ramal} onChange={(e) => set("ramal", e.target.value.replace(/\\D/g, "").slice(0, 20))} placeholder="Ex.: 7001" required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conf-max">Máximo de participantes</Label>
              <Input id="conf-max" type="number" min={2} max={1000} value={form.max_participantes} onChange={(e) => set("max_participantes", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="conf-mixing">Mixing interval (ms)</Label>
                <FieldHelp text="Intervalo de mistura de áudio. Deve ser compatível com o ConfBridge no Asterisk." />
              </div>
              <Input id="conf-mixing" type="number" min={10} max={1000} value={form.mixing_interval} onChange={(e) => set("mixing_interval", Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-3 pt-1">
            <Toggle label="Gravar conferência" checked={form.gravar} onChange={(v) => set("gravar", v)} />
            <Toggle label="Permitir vídeo" checked={form.permitir_video} onChange={(v) => set("permitir_video", v)} />
            <Toggle label="Sala ativa" checked={form.ativo} onChange={(v) => set("ativo", v)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={!valid || mut.isPending}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
