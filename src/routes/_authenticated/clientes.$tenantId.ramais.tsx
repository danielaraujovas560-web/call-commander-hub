import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OnlineBadge } from "@/components/online-badge";
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  PhoneCall,
} from "lucide-react";
import { listRamais, listRamaisStatus, listTroncos, createRamal, updateRamal, deleteRamal, type Ramal, } from "@/lib/ramais.functions";

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

export const listaDDDs = Array.from({ length: 89 }, (_, i) => String(i + 11));

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
  const statusFn = useServerFn(listRamaisStatus);

  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => list({ data: { tenant_id: tenantId } }),
  });

  const { data: statusData } = useQuery({
    queryKey: ["ramais-status", tenantId],
    queryFn: () => statusFn({ data: { tenant_id: tenantId } }),
    refetchInterval: 5000, // opcional
  });

  const del = useServerFn(deleteRamal);
  const delMut = useMutation({
    mutationFn: (endpoint_id: string) => del({ data: { endpoint_id, tenant_id: tenantId } }),
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
              <TableHead>Sem Permissão Lig/</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead>Status</TableHead>
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
              <TableRow key={r.endpoint_id}>
                <TableCell className="font-mono">{r.ramal}</TableCell>
                <TableCell>{r.ramal_nome ? r.ramal_nome.replace(/-/g, " ") : "-"}</TableCell>
                <TableCell>{r.tronco_nome ?? "-"}</TableCell>
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
                <TableCell>
                  <OnlineBadge state={statusData?.endpoints?.[String(r.ramal)]} showLabel />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <EditRamalDialog key={`${r.endpoint_id}-${r.senha}-${r.transbordo}-${r.transbordo_tronco}`} tenantId={tenantId} ramal={r} />
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
                          <AlertDialogAction onClick={() => delMut.mutate(r.endpoint_id)}>
                            Remover
                          </AlertDialogAction>
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

  const emptyForm = {
    nome: "",
    ramal: "",
    tronco: "",
    ddd: "",
    callerid: "",
    fixo: false,
    movel: false,
    ddi: false,
    especial: false,
    cng: false,
    transbordo: false,
    transbordo_troncos: [] as string[],
  };
  const queryClient = useQueryClient();
  const create = useServerFn(createRamal);
  const [form, setForm] = useState(emptyForm);

  // reset ao abrir
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setForm(emptyForm);
  };

  const troncos = troncosData?.troncos ?? [];
  const troncosDisponiveisTransbordo = troncos.filter((t) => t.nome !== form.tronco);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          ...form,
          tenant_id: tenantId,
          transbordo_tronco: form.transbordo && form.transbordo_troncos.length
            ? form.transbordo_troncos.join("&")
            : "",
        },
      }),
    onSuccess: () => {
      toast.success("Ramal criado");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar ramal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo ramal</DialogTitle>
          <DialogDescription>
            Senha será gerada automaticamente. Você poderá editar depois.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="space-y-1">
            <Label>Ramal *</Label>
            <Input
              value={form.ramal}
              onChange={(e) => setForm({ ...form, ramal: e.target.value.replace(/\D/g, "") })}
              required
              maxLength={6}
              placeholder="1234"
            />
          </div>
          <div className="space-y-1">
            <Label>DDD *</Label>
              <Select 
                value={form.ddd} 
                onValueChange={(value) => setForm({ ...form, ddd: value })}
            >
             <SelectTrigger className="w-full">
                 <SelectValue placeholder="Selecione o DDD" />
               </SelectTrigger>
               <SelectContent>
                 {Array.from({ length: 89 }, (_, i) => String(i + 11)).map((ddd) => (
                   <SelectItem key={ddd} value={ddd}>
                     {ddd}
                   </SelectItem>
                 ))}
               </SelectContent>
              </Select>
             </div>
          
          <div className="col-span-2 space-y-1">
            <Label>Nome (opcional — usa nº do ramal se vazio)</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Tronco *</Label>
            <Select value={form.tronco} onValueChange={(v) => setForm({ ...form, tronco: v, transbordo_troncos: form.transbordo_troncos.filter((t) => t !== v) })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um tronco" />
              </SelectTrigger>
              <SelectContent>
                {troncos.map((t) => (
                  <SelectItem key={t.id} value={t.nome}>
                    {t.nome} {t.tipo ? `(${t.tipo})` : ""}
                  </SelectItem>
                ))}
                {troncos.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum tronco encontrado</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label>CallerID (opcional — qualquer texto)</Label>
            <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value })} maxLength={32} />
          </div>

          <div className="col-span-2 rounded-md border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.transbordo}
                onCheckedChange={(v) => setForm({ ...form, transbordo: v, transbordo_troncos: v ? form.transbordo_troncos : [] })}
              />
              Transbordo
            </label>
            {form.transbordo && (
              <TransbordoTroncosSelector
                available={troncosDisponiveisTransbordo}
                selected={form.transbordo_troncos}
                onChange={(v) => setForm({ ...form, transbordo_troncos: v })}
              />
            )}
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md border p-3">
            <div className="col-span-2 text-xs text-muted-foreground">
              Ativo = <strong>bloqueia</strong> este tipo de ligação
            </div>
            {[
              ["fixo", "Bloquear fixo"],
              ["movel", "Bloquear móvel"],
              ["ddi", "Bloquear DDI"],
              ["especial", "Bloquear especial"],
              ["cng", "Bloquear CNG"],
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

function TransbordoTroncosSelector({
  available,
  selected,
  onChange,
}: {
  available: { id: number; nome: string; tipo: string | null }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const remaining = available.filter((t) => !selected.includes(t.nome));
  const [pick, setPick] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {selected.map((s) => (
          <Badge key={s} variant="secondary" className="gap-1">
            {s}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(selected.filter((x) => x !== s))}
            >
              ×
            </button>
          </Badge>
        ))}
        {selected.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum tronco de transbordo selecionado</span>
        )}
      </div>
      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={remaining.length ? "Selecione tronco…" : "Nenhum disponível"} />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((t) => (
              <SelectItem key={t.id} value={t.nome}>
                {t.nome} {t.tipo ? `(${t.tipo})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!pick}
          onClick={() => { onChange([...selected, pick]); setPick(""); }}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}


function EditRamalDialog({ tenantId, ramal }: { tenantId: number; ramal: Ramal }) {
  const [open, setOpen] = useState(false);
  const troncosFn = useServerFn(listTroncos);
  const { data: troncosData } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => troncosFn({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const initial = () => ({
    nome: ramal.ramal_nome ?? "",
    senha: ramal.senha ?? "",
    tronco: ramal.tronco ?? "",
    ddd: ramal.ddd ?? "",
    callerid: ramal.callerid ?? "",
    fixo: ramal.fixo,
    movel: ramal.movel,
    ddi: ramal.ddi,
    especial: ramal.especial,
    cng: ramal.cng,
    transbordo: ramal.transbordo,
    transbordo_troncos: ramal.transbordo_tronco
      ? ramal.transbordo_tronco.split("&").filter(Boolean)
      : [],
  });
  const [form, setForm] = useState(initial);

  // Sempre que o dialog abrir, reseta para os valores do banco (evita cache "sujo")
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setForm(initial());
  };

  const troncos = troncosData?.troncos ?? [];
  const troncosDisponiveisTransbordo = troncos.filter((t) => t.nome !== form.tronco);

  const queryClient = useQueryClient();
  const update = useServerFn(updateRamal);
  const mut = useMutation({
    mutationFn: () =>
      update({
        data: {
          endpoint_id: ramal.endpoint_id,
          tenant_id: tenantId,
          nome: form.nome,
          senha: form.senha,
          tronco: form.tronco,
          ddd: form.ddd,
          callerid: form.callerid,
          fixo: form.fixo,
          movel: form.movel,
          ddi: form.ddi,
          especial: form.especial,
          cng: form.cng,
          transbordo: form.transbordo,
          transbordo_tronco: form.transbordo
            ? form.transbordo_troncos.join("&")
            : "",
        },
      }),
    onSuccess: () => {
      toast.success("Ramal atualizado");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar ramal {ramal.ramal}</DialogTitle>
          <DialogDescription>
            Permissões marcadas = <strong>bloqueado</strong> para aquele tipo de ligação.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2 space-y-1">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>DDD</Label>
            <Select 
              value={form.ddd} 
              onValueChange={(value) => setForm({ ...form, ddd: value })}
           >
           <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o DDD" />
           </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 89 }, (_, i) => String(i + 11)).map((ddd) => (
              <SelectItem key={ddd} value={ddd}>
                {ddd}
              </SelectItem>
             ))}
           </SelectContent>
          </Select>
         </div>
          <div className="space-y-1">
            <Label>CallerID</Label>
            <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value })} maxLength={32} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Tronco</Label>
            <Select
              value={form.tronco}
              onValueChange={(v) => setForm({
                ...form, tronco: v,
                transbordo_troncos: form.transbordo_troncos.filter((t) => t !== v),
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um tronco" />
              </SelectTrigger>
              <SelectContent>
                {troncos.map((t) => (
                  <SelectItem key={t.id} value={t.nome}>
                    {t.nome} {t.tipo ? `(${t.tipo})` : ""}
                  </SelectItem>
                ))}
                {troncos.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum tronco disponível</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Senha</Label>
            <div className="flex gap-2">
              <Input value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, senha: genPassword() })}>
                Gerar
              </Button>
            </div>
          </div>

          <div className="col-span-2 rounded-md border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.transbordo}
                onCheckedChange={(v) => setForm({ ...form, transbordo: v, transbordo_troncos: v ? form.transbordo_troncos : [] })}
              />
              Transbordo
            </label>
            {form.transbordo && (
              <TransbordoTroncosSelector
                available={troncosDisponiveisTransbordo}
                selected={form.transbordo_troncos}
                onChange={(v) => setForm({ ...form, transbordo_troncos: v })}
              />
            )}
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md border p-3">
            <div className="col-span-2 text-xs text-muted-foreground">
              Ativo = bloqueia esse tipo de chamada
            </div>
            {[
              ["fixo", "Bloquear fixo"],
              ["movel", "Bloquear móvel"],
              ["ddi", "Bloquear DDI"],
              ["especial", "Bloquear especial"],
              ["cng", "Bloquear CNG"],
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
              {mut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


