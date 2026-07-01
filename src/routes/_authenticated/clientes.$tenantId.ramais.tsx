import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  PhoneCall,
} from "lucide-react";
import {
  listRamais,
  listTroncos,
  createRamal,
  updateRamal,
  deleteRamal,
  type Ramal,
} from "@/lib/ramais.functions";

import { getClienteByTenant } from "@/lib/clientes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/ramais")({
  head: () => ({ meta: [{ title: "Ramais — Cliente — Painel PABX" }] }),
  component: RamaisPage,
});

function RamaisPage() {
  const { tenantId: tenantParam } = Route.useParams();
  const tenantId = Number(tenantParam);

  const clienteFn = useServerFn(getClienteByTenant);
  const { data: clienteData } = useQuery({
    queryKey: ["cliente", tenantId],
    queryFn: () => clienteFn({ data: { tenant_id: tenantId } }),
    retry: false,
  });
  const max = clienteData?.cliente?.quantidade_ramais ?? 0;

  const list = useServerFn(listRamais);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => list({ data: { tenant_id: tenantId } }),
  });

  const del = useServerFn(deleteRamal);
  const delMut = useMutation({
    mutationFn: (id: number) => del({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Ramal removido");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const count = data?.ramais.length ?? 0;
  const atLimit = max > 0 && count >= max;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PhoneCall className="h-6 w-6" /> Ramais
          </h1>
          <p className="text-sm text-muted-foreground">
            {count} {max > 0 ? `/ ${max}` : ""} ramais cadastrados
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <NewRamalDialog tenantId={tenantId} disabled={atLimit} />
        </div>
      </div>

      {atLimit && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          Limite de {max} ramais atingido para este cliente.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ramal</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tronco</TableHead>
              <TableHead>DDD</TableHead>
              <TableHead>CallerID</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && data?.ramais.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhum ramal cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {data?.ramais.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.ramal}</TableCell>
                <TableCell>{r.nome ?? "-"}</TableCell>
                <TableCell>{r.tronco ?? "-"}</TableCell>
                <TableCell>{r.ddd ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{r.callerid ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.fixo && <Badge variant="secondary">Fixo</Badge>}
                    {r.movel && <Badge variant="secondary">Móvel</Badge>}
                    {r.ddi && <Badge variant="secondary">DDI</Badge>}
                    {r.especial && <Badge variant="secondary">Especial</Badge>}
                    {r.cng && <Badge variant="secondary">CNG</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <PasswordCell value={r.senha ?? ""} />
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover ramal {r.ramal}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação remove o ramal e seu endpoint SIP. Não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => delMut.mutate(r.id)}>
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PasswordCell({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs">{shown ? value : "•".repeat(8)}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function genPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function NewRamalDialog({ tenantId, disabled }: { tenantId: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const troncosFn = useServerFn(listTroncos);
  const { data: troncosData } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => troncosFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const queryClient = useQueryClient();
  const create = useServerFn(createRamal);
  const [form, setForm] = useState({
    nome: "",
    ramal: "",
    senha: "",
    tronco: "",
    ddd: "",
    callerid: "",
    fixo: true,
    movel: true,
    ddi: false,
    especial: false,
    cng: false,
  });

  const mut = useMutation({
    mutationFn: () => create({ data: { ...form, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Ramal criado");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
      setOpen(false);
      setForm({
        nome: "", ramal: "", senha: "", tronco: "", ddd: "", callerid: "",
        fixo: true, movel: true, ddi: false, especial: false, cng: false,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar ramal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo ramal</DialogTitle>
          <DialogDescription>Cadastra o ramal e cria o endpoint SIP no servidor.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2 space-y-1">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Ramal</Label>
            <Input value={form.ramal} onChange={(e) => setForm({ ...form, ramal: e.target.value.replace(/\D/g, "") })} required maxLength={6} />
          </div>
          <div className="space-y-1">
            <Label>DDD</Label>
            <Input value={form.ddd} onChange={(e) => setForm({ ...form, ddd: e.target.value.replace(/\D/g, "") })} required maxLength={2} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Senha</Label>
            <div className="flex gap-2">
              <Input value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required minLength={6} />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, senha: genPassword() })}>
                Gerar
              </Button>
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Tronco</Label>
            <Select value={form.tronco} onValueChange={(v) => setForm({ ...form, tronco: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um tronco" />
              </SelectTrigger>
              <SelectContent>
                {(troncosData?.troncos ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.nome}>
                    {t.nome} {t.tipo ? `(${t.tipo})` : ""}
                  </SelectItem>
                ))}
                {troncosData?.troncos.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum tronco encontrado</div>
                )}
              </SelectContent>

            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>CallerID (opcional)</Label>
            <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value.replace(/\D/g, "") })} maxLength={13} />
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md border p-3">
            {[
              ["fixo", "Liga p/ fixo"],
              ["movel", "Liga p/ móvel"],
              ["ddi", "DDI"],
              ["especial", "Especial"],
              ["cng", "CNG"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form[key as keyof typeof form] as boolean}
                  onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                />
                {label}
              </label>
            ))}
          </div>

          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Criando..." : "Criar ramal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
