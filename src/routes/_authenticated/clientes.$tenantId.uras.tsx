import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Workflow, RefreshCw, ListTree, Plus, Trash2, Pencil } from "lucide-react";
import {
  listUras,
  createUra,
  updateUra,
  deleteUra,
  addUraOpcao,
  updateUraOpcao,
  deleteUraOpcao,
  listUraAudios,
  listUraDestinos,
  type Ura,
} from "@/lib/ramais.functions";
import { displayFromBackend } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/uras")({
  head: () => ({ meta: [{ title: "URAs — Cliente — Painel PABX" }] }),
  component: UrasPage,
});

const TIPOS_INTERNOS = [
  { value: "desligar", label: "Desligar" },
  { value: "repetir", label: "Repetir" },
];

function UrasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listUras);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["uras", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const uras = data?.uras ?? [];

  const [selected, setSelected] = useState<Ura | null>(null);
  const [editing, setEditing] = useState<Ura | null>(null);

  const delFn = useServerFn(deleteUra);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("URA removida");
      qc.invalidateQueries({ queryKey: ["uras", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6" /> URAs
          </h1>
          <p className="text-sm text-muted-foreground">URAs configuradas para este cliente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <UraFormDialog tenantId={tenantId} />
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
              <TableHead>Nome</TableHead>
              <TableHead>Áudio</TableHead>
              <TableHead>Máx. dígitos</TableHead>
              <TableHead>Tentativas</TableHead>
              <TableHead>Timeout (s)</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && uras.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma URA cadastrada.</TableCell></TableRow>
            )}
            {uras.map((u) => (
              <TableRow key={u.id}>
                <TableCell className={u.ativo ? "" : "text-muted-foreground"}>{u.nome}</TableCell>
                <TableCell className="font-mono text-xs">{u.audio}</TableCell>
                <TableCell>{u.max_digits ?? "-"}</TableCell>
                <TableCell>{u.tentativas ?? "-"}</TableCell>
                <TableCell>{u.timeout ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Sim" : "Não"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(u)}>
                      <ListTree className="h-4 w-4 mr-1" /> Opções
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(u)}>
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
                          <AlertDialogTitle>Remover URA {u.nome}?</AlertDialogTitle>
                          <AlertDialogDescription>Também remove todas as opções configuradas.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(u.id)}>Remover</AlertDialogAction>
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

      {selected && (
        <UraOpcoesDialog
          tenantId={tenantId}
          ura={uras.find((u) => u.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
        />
      )}
      {editing && (
        <UraFormDialog
          tenantId={tenantId}
          ura={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------- Form (create/edit) ----------
function UraFormDialog({
  tenantId,
  ura,
  open: controlledOpen,
  onOpenChange,
}: {
  tenantId: number;
  ura?: Ura;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const editing = !!ura;

  const audiosFn = useServerFn(listUraAudios);
  const { data: audiosData } = useQuery({
    queryKey: ["ura-audios", tenantId],
    queryFn: () => audiosFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const [form, setForm] = useState({
    nome: ura?.nome ?? "",
    audio: ura?.audio ?? "",
    max_digits: ura?.max_digits ?? 1,
    tentativas: ura?.tentativas ?? 3,
    timeout: ura?.timeout ?? 10,
    ativo: ura?.ativo ?? true,
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setForm({
        nome: ura?.nome ?? "",
        audio: ura?.audio ?? "",
        max_digits: ura?.max_digits ?? 1,
        tentativas: ura?.tentativas ?? 3,
        timeout: ura?.timeout ?? 10,
        ativo: ura?.ativo ?? true,
      });
    }
  };

  const qc = useQueryClient();
  const createFn = useServerFn(createUra);
  const updateFn = useServerFn(updateUra);
  const mut = useMutation({
    mutationFn: () =>
      editing
        ? updateFn({ data: { id: ura!.id, tenant_id: tenantId, ...form } })
        : createFn({ data: { tenant_id: tenantId, ...form } }),
    onSuccess: () => {
      toast.success(editing ? "URA atualizada" : "URA criada");
      qc.invalidateQueries({ queryKey: ["uras", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const audios = audiosData?.audios ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!editing && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Adicionar URA
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar URA ${ura!.nome}` : "Nova URA"}</DialogTitle>
          <DialogDescription>
            {audiosData?.warn ? `Pasta de áudios: ${audiosData.dir} (${audiosData.warn})` : `Áudios em ${audiosData?.dir ?? "…"}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label>Áudio * (arquivos em /ura/t{tenantId}/)</Label>
            <Select value={form.audio} onValueChange={(v) => setForm({ ...form, audio: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o áudio" /></SelectTrigger>
              <SelectContent>
                {audios.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                {audios.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum .wav encontrado</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>Máx. dígitos</Label>
              <Input type="number" min={1} max={20} value={form.max_digits}
                     onChange={(e) => setForm({ ...form, max_digits: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Tentativas</Label>
              <Input type="number" min={1} max={10} value={form.tentativas}
                     onChange={(e) => setForm({ ...form, tentativas: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Timeout (s)</Label>
              <Input type="number" min={1} max={120} value={form.timeout}
                     onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            Ativo
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !form.audio || !form.nome}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Opções ----------
type TipoOpc = "" | "FILA" | "URA" | "RAMAL" | "INTERNO" | "EXTERNO";
type OpcaoForm = {
  digito: string;
  tipo_destino: TipoOpc;
  destino: string;
  externoNumero: string;
  externoTronco: string;
};
const emptyOpcao: OpcaoForm = { digito: "", tipo_destino: "", destino: "", externoNumero: "", externoTronco: "" };

function opcaoToForm(o: { digito: string; tipo_destino: string; destino: string }): OpcaoForm {
  const t = String(o.tipo_destino || "").toUpperCase() as TipoOpc;
  if (t === "EXTERNO" && o.destino.includes("/")) {
    const [n, tr] = o.destino.split("/");
    return { digito: o.digito, tipo_destino: t, destino: "", externoNumero: n, externoTronco: tr };
  }
  return { digito: o.digito, tipo_destino: t, destino: o.destino, externoNumero: "", externoTronco: "" };
}

function UraOpcoesDialog({ tenantId, ura, onClose }: { tenantId: number; ura: Ura; onClose: () => void }) {
  const destinosFn = useServerFn(listUraDestinos);
  const { data: destinos } = useQuery({
    queryKey: ["ura-destinos", tenantId],
    queryFn: () => destinosFn({ data: { tenant_id: tenantId } }),
  });

  const qc = useQueryClient();
  const addFn = useServerFn(addUraOpcao);
  const updateFn = useServerFn(updateUraOpcao);
  const delFn = useServerFn(deleteUraOpcao);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OpcaoForm>(emptyOpcao);

  function reset() { setForm(emptyOpcao); setEditingId(null); }

  const saveMut = useMutation({
    mutationFn: () => {
      const destino = form.tipo_destino === "EXTERNO"
        ? `${form.externoNumero}/${form.externoTronco}`
        : form.destino;
      const body = {
        tenant_id: tenantId,
        digito: form.digito,
        tipo_destino: form.tipo_destino as Exclude<TipoOpc, "">,
        destino,
      };
      return editingId
        ? updateFn({ data: { id: editingId, ...body } })
        : addFn({ data: { ura_id: ura.id, ...body } });
    },
    onSuccess: () => {
      toast.success(editingId ? "Opção atualizada" : "Opção adicionada");
      qc.invalidateQueries({ queryKey: ["uras", tenantId] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uras", tenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function renderDestino(o: { tipo_destino: string; destino: string }) {
    const t = String(o.tipo_destino).toUpperCase();
    if (t === "FILA") {
      return destinos?.filas.find((x) => String(x.value) === o.destino)?.label ?? o.destino;
    }
    if (t === "URA") {
      return destinos?.uras.find((x) => String(x.value) === o.destino)?.label ?? o.destino;
    }
    if (t === "RAMAL") {
      const r = destinos?.ramais.find((x) => String(x.value) === o.destino);
      return r?.label ? displayFromBackend(r.label) : o.destino;
    }
    if (t === "INTERNO") {
      return TIPOS_INTERNOS.find((x) => x.value === o.destino)?.label ?? o.destino;
    }
    return o.destino;
  }

  const disabled = !form.tipo_destino || (
    form.tipo_destino === "EXTERNO"
      ? !form.externoNumero || !form.externoTronco
      : !form.destino
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{displayFromBackend(ura.nome)} — Opções</DialogTitle>
          <DialogDescription>Configure os destinos por dígito.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dígito</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="w-20 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ura.opcoes ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono">{o.digito || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{String(o.tipo_destino).toUpperCase()}</Badge></TableCell>
                  <TableCell>{renderDestino(o)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditingId(o.id); setForm(opcaoToForm(o)); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => delMut.mutate(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(ura.opcoes ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Sem opções.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium">{editingId ? "Editar opção" : "Nova opção"}</div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label>Dígito</Label>
              <Input value={form.digito} maxLength={4}
                     onChange={(e) => setForm({ ...form, digito: e.target.value })} placeholder="0-9,*,#,t,i" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo_destino} onValueChange={(v: any) => setForm({ ...form, tipo_destino: v, destino: "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FILA">FILA</SelectItem>
                  <SelectItem value="URA">URA</SelectItem>
                  <SelectItem value="RAMAL">RAMAL</SelectItem>
                  <SelectItem value="INTERNO">INTERNO</SelectItem>
                  <SelectItem value="EXTERNO">EXTERNO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Destino</Label>
              {form.tipo_destino === "FILA" && (
                <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a fila" /></SelectTrigger>
                  <SelectContent>
                    {destinos?.filas.map((f) => (<SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              {form.tipo_destino === "URA" && (
                <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a URA" /></SelectTrigger>
                  <SelectContent>
                    {destinos?.uras.filter((u) => u.value !== ura.id).map((u) => (
                      <SelectItem key={u.value} value={String(u.value)}>{displayFromBackend(u.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {form.tipo_destino === "RAMAL" && (
                <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o ramal" /></SelectTrigger>
                  <SelectContent>
                    {destinos?.ramais.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>{displayFromBackend(r.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {form.tipo_destino === "INTERNO" && (
                <Select value={form.destino} onValueChange={(v) => setForm({ ...form, destino: v })}>
                  <SelectTrigger><SelectValue placeholder="Função" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_INTERNOS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              {form.tipo_destino === "EXTERNO" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.externoNumero} onChange={(e) => setForm({ ...form, externoNumero: e.target.value })} placeholder="Número" />
                  <Select value={form.externoTronco} onValueChange={(v) => setForm({ ...form, externoTronco: v })}>
                    <SelectTrigger><SelectValue placeholder="Tronco" /></SelectTrigger>
                    <SelectContent>
                      {destinos?.troncos.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!form.tipo_destino && (
                <Input disabled placeholder="Escolha o tipo primeiro" />
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && <Button type="button" variant="outline" onClick={reset}>Cancelar edição</Button>}
            <Button disabled={disabled || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {editingId ? <><Pencil className="mr-1 h-4 w-4" /> Salvar</> : <><Plus className="mr-1 h-4 w-4" /> Adicionar opção</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
