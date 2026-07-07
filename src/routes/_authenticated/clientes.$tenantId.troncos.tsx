import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Cable, RefreshCw, Plus, Pencil, Trash2, Lock } from "lucide-react";
import {
  listTroncos, listTroncosStatus, createTronco, updateTronco, deleteTronco,
  type Tronco,
} from "@/lib/ramais.functions";
import { OnlineBadge } from "@/components/online-badge";
import { useIsAdmin } from "@/hooks/use-role";
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

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/troncos")({
  head: () => ({ meta: [{ title: "Troncos — Cliente — Painel PABX" }] }),
  component: TroncosPage,
});

function TroncosPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const fn = useServerFn(listTroncos);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const troncos = data?.troncos ?? [];
  const [editing, setEditing] = useState<Tronco | null>(null);

  const delFn = useServerFn(deleteTronco);
  const delMut = useMutation({
    mutationFn: (id: number) => delFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => { toast.success("Tronco removido"); qc.invalidateQueries({ queryKey: ["troncos", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cable className="h-6 w-6" /> Troncos
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Configuração de troncos SIP." : (
              <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Somente leitura (admin edita).</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {isAdmin && <TroncoFormDialog tenantId={tenantId} />}
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
              <TableHead>IP</TableHead>
              <TableHead>Porta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Prefixo</TableHead>
              <TableHead>Registrar</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-10">Carregando…</TableCell></TableRow>}
            {!isLoading && troncos.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhum tronco.</TableCell></TableRow>}
            {troncos.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.nome}</TableCell>
                <TableCell className="font-mono text-xs">{t.ip ?? "-"}</TableCell>
                <TableCell className="font-mono">{t.porta ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{t.tipo}</Badge></TableCell>
                <TableCell className="font-mono">{t.techprefix ?? "-"}</TableCell>
                <TableCell>{t.registrar === "sim" ? "Sim" : "Não"}</TableCell>
                <TableCell><Badge variant={t.status ? "default" : "secondary"}>{t.status ? "Ativo" : "Inativo"}</Badge></TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover tronco {t.nome}?</AlertDialogTitle>
                            <AlertDialogDescription>Remove endpoint, aor, auth, id_ips e registrations.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => delMut.mutate(t.id)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && isAdmin && (
        <TroncoFormDialog
          tenantId={tenantId}
          tronco={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

function TroncoFormDialog({
  tenantId, tronco, open: controlledOpen, onOpenChange,
}: { tenantId: number; tronco?: Tronco; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => onOpenChange ? onOpenChange(v) : setInternalOpen(v);
  const editing = !!tronco;

  const [form, setForm] = useState({
    nome: tronco?.nome ?? "",
    ip: tronco?.ip ?? "",
    porta: tronco?.porta ?? "5060",
    tipo: (tronco?.tipo as "STFC" | "E164") ?? "STFC",
    techprefix: tronco?.techprefix ?? "",
    registrar: (tronco?.registrar === "sim") as boolean,
    login: tronco?.login ?? "",
    senha: tronco?.senha ?? "",
  });

  useEffect(() => {
    if (open && tronco) {
      setForm({
        nome: tronco.nome ?? "",
        ip: tronco.ip ?? "",
        porta: tronco.porta ?? "5060",
        tipo: (tronco.tipo as any) ?? "STFC",
        techprefix: tronco.techprefix ?? "",
        registrar: tronco.registrar === "sim",
        login: tronco.login ?? "",
        senha: tronco.senha ?? "",
      });
    } else if (open && !tronco) {
      setForm({ nome: "", ip: "", porta: "5060", tipo: "STFC", techprefix: "", registrar: false, login: "", senha: "" });
    }
  }, [open, tronco]);

  const qc = useQueryClient();
  const createFn = useServerFn(createTronco);
  const updateFn = useServerFn(updateTronco);
  const mut = useMutation({
    mutationFn: () => {
      const body: any = {
        tenant_id: tenantId,
        nome: form.nome,
        ip: form.ip,
        porta: form.porta || "5060",
        tipo: form.tipo,
        techprefix: form.techprefix || "",
        registrar: (form.registrar ? "sim" : "não") as "sim" | "não",
        login: form.registrar ? form.login : "",
        senha: form.registrar ? form.senha : "",
      };
      return editing
        ? updateFn({ data: { id: tronco!.id, ...body } })
        : createFn({ data: body });
    },
    onSuccess: () => {
      toast.success(editing ? "Tronco atualizado" : "Tronco criado");
      qc.invalidateQueries({ queryKey: ["troncos", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!editing && (
        <DialogTrigger asChild>
          <Button><Plus className="mr-2 h-4 w-4" /> Novo tronco</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar tronco ${tronco!.nome}` : "Novo tronco"}</DialogTitle>
          <DialogDescription>Configuração dos endpoints, aors e registros PJSIP.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required maxLength={50} />
            </div>
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STFC">STFC</SelectItem>
                  <SelectItem value="E164">E164</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1"><Label>IP / DNS *</Label>
              <Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} required />
            </div>
            <div className="space-y-1"><Label>Porta</Label>
              <Input value={form.porta} onChange={(e) => setForm({ ...form, porta: e.target.value })} placeholder="5060" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Techprefix (só números)</Label>
            <Input value={form.techprefix} onChange={(e) => setForm({ ...form, techprefix: e.target.value.replace(/\D/g, "") })} maxLength={20} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.registrar} onCheckedChange={(v) => setForm({ ...form, registrar: v })} />
            Registrar (envia REGISTER para operadora)
          </label>
          {form.registrar && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Login</Label>
                <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
              </div>
              <div className="space-y-1"><Label>Senha</Label>
                <Input value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending || !form.nome || !form.ip}>
              {mut.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
