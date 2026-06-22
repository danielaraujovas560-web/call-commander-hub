import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldBan, Plus, Trash2, RefreshCw } from "lucide-react";
import {
  listBlacklist, createBlacklist, deleteBlacklist,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/blacklist")({
  head: () => ({ meta: [{ title: "Blacklist — Cliente — Painel PABX" }] }),
  component: BlacklistPage,
});

function BlacklistPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listBlacklist);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["blacklist", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const del = useServerFn(deleteBlacklist);
  const delMut = useMutation({
    mutationFn: (id: number) => del({ data: { id, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["blacklist", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = data?.blacklist ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldBan className="h-6 w-6" /> Blacklist
          </h1>
          <p className="text-sm text-muted-foreground">Números e prefixos bloqueados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <NewBlacklistDialog tenantId={tenantId} onDone={() => qc.invalidateQueries({ queryKey: ["blacklist", tenantId] })} />
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
              <TableHead>Regra</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Desbloqueio em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum bloqueio.</TableCell></TableRow>
            )}
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell><Badge variant="outline">{b.regra}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{b.tipo}</Badge></TableCell>
                <TableCell className="font-mono">{b.destino}</TableCell>
                <TableCell className="text-xs">{b.motivo || "-"}</TableCell>
                <TableCell className="text-xs">{b.data_hora_desbloqueio}</TableCell>
                <TableCell>{b.ativo ? <Badge>ativo</Badge> : <Badge variant="secondary">inativo</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (confirm("Remover este bloqueio?")) delMut.mutate(b.id);
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewBlacklistDialog({ tenantId, onDone }: { tenantId: number; onDone: () => void }) {
  const fn = useServerFn(createBlacklist);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    regra: "Entrada" as "Entrada" | "Saida",
    tipo: "Numero" as "Prefixo" | "Numero",
    destino: "",
    motivo: "",
    data_hora_desbloqueio: "",
  });
  const mut = useMutation({
    mutationFn: () => fn({ data: { ...form, tenant_id: tenantId } }),
    onSuccess: () => {
      toast.success("Bloqueio adicionado");
      setOpen(false);
      setForm({ regra: "Entrada", tipo: "Numero", destino: "", motivo: "", data_hora_desbloqueio: "" });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo bloqueio</DialogTitle>
          <DialogDescription>Bloqueia um número ou prefixo de entrada/saída.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Regra</Label>
            <Select value={form.regra} onValueChange={(v: any) => setForm({ ...form, regra: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Entrada">Entrada</SelectItem>
                <SelectItem value="Saida">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v: any) => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Numero">Número</SelectItem>
                <SelectItem value="Prefixo">Prefixo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Destino (número ou prefixo)</Label>
            <Input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="col-span-2">
            <Label>Motivo (opcional)</Label>
            <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Data/hora de desbloqueio</Label>
            <Input
              type="datetime-local"
              value={form.data_hora_desbloqueio}
              onChange={(e) => setForm({ ...form, data_hora_desbloqueio: e.target.value.replace("T", " ") + ":00" })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.destino || !form.data_hora_desbloqueio || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Salvando…" : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
