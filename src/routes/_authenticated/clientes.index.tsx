import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ToggleAtivoBadge } from "@/components/toggle-ativo-badge";
import {
  listClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  updateClienteConfiguracoes,
  type Cliente,
} from "@/lib/clientes.functions";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, LogIn, Pencil, Plus, Trash2, Settings2 } from "lucide-react";
import { ShapeConfirmDialog } from "@/components/shape-confirm-dialog";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({ meta: [{ title: "Clientes — Painel PABX" }] }),
  component: ClientesPage,
});

function ClientesPage() {
  const { isAdmin } = useIsAdmin();
  const fetchFn = useServerFn(listClientes);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchFn(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["clientes"] });

  const updateClienteFn = useServerFn(updateCliente);

  const toggleAtivoMut = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      updateClienteFn({ data: { id, ativo } }),
    onSuccess: () => {
      toast.success("Cliente atualizado");
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const clientes = data?.clientes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Cadastre clientes (tenants do PABX). Os logins de acesso são criados em Administração → Usuários e vinculados pelo Tenant ID."
              : "Seus clientes."}
          </p>
        </div>
        {isAdmin && <NewClienteDialog onDone={invalidate} />}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Id</TableHead>
              <TableHead>Razão social</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && clientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Nenhum cliente cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {clientes.map((c) => (
              <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <TableCell>#{c.tenant_id}</TableCell>
                <TableCell className="font-medium">{c.razao_social}</TableCell>
                <TableCell className="font-mono text-xs">{c.cnpj}</TableCell>
                <TableCell className="font-mono text-xs">{c.email}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <ToggleAtivoBadge
                      ativo={c.ativo}
                      isPending={toggleAtivoMut.isPending}
                      onToggle={() => toggleAtivoMut.mutate({ id: c.id, ativo: !c.ativo })}
                    />
                  ) : (
                    <Badge variant={c.ativo ? "default" : "secondary"}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/clientes/$tenantId" params={{ tenantId: String(c.tenant_id) }}>
                        <LogIn className="mr-1 h-3 w-3" />
                        Acessar
                      </Link>
                    </Button>
                    {isAdmin && (
                      <>
                        <EditClienteDialog cliente={c} onDone={invalidate} />
                        <SettingsClient cliente={c} onDone={invalidate} />
                        <DeleteButton cliente={c} onDone={invalidate} />
                      </>
                    )}
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

function SettingsClient({ cliente, onDone }: { cliente: Cliente; onDone: () => void }) {
  const fn = useServerFn(updateClienteConfiguracoes);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<{
    quantidade_ramais: number | "";
    quantidade_filas: number | "";
    quantidade_uras: number | "";
  }>({
    quantidade_ramais: cliente.quantidade_ramais,
    quantidade_filas: cliente.quantidade_filas,
    quantidade_uras: cliente.quantidade_uras,
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: cliente.id,
          quantidade_ramais: Number(form.quantidade_ramais),
          quantidade_filas: Number(form.quantidade_filas),
          quantidade_uras: Number(form.quantidade_uras),
        },
      }),
    onSuccess: () => {
      toast.success("Configurações atualizadas");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);

        if (o) {
          setForm({
            quantidade_ramais: cliente.quantidade_ramais,
            quantidade_filas: cliente.quantidade_filas,
            quantidade_uras: cliente.quantidade_uras,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-w-lg"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            mut.mutate();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Configurações do cliente</DialogTitle>
          <DialogDescription>Id #{cliente.tenant_id}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Quantidade de ramais</Label>
            <Input
              type="number"
              min="0"
              value={form.quantidade_ramais}
              onChange={(e) =>
                setForm({
                  ...form,
                  quantidade_ramais: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </div>

          <div>
            <Label>Quantidade de filas</Label>
            <Input
              type="number"
              min="0"
              value={form.quantidade_filas}
              onChange={(e) =>
                setForm({
                  ...form,
                  quantidade_filas: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </div>

          <div>
            <Label>Quantidade de URAs</Label>
            <Input
              type="number"
              min="0"
              value={form.quantidade_uras}
              onChange={(e) =>
                setForm({
                  ...form,
                  quantidade_uras: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function DeleteButton({ cliente, onDone }: { cliente: Cliente; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(deleteCliente);
  const mut = useMutation({
    mutationFn: () => fn({ data: { id: cliente.id } }),
    onSuccess: () => {
      toast.success("Cliente removido");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <ShapeConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remover cliente "${cliente.razao_social}"?`}
        description="Isso apaga ramais, troncos, filas, URAs, CDR e todo o histórico deste tenant."
        confirmLabel="Apagar tudo"
        confirming={mut.isPending}
        onConfirm={() => mut.mutate()}
      />
    </>
  );
}

function NewClienteDialog({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(createCliente);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cnpj: "",
    razao_social: "",
    email: "",
    tenant_id: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          cnpj: form.cnpj,
          razao_social: form.razao_social,
          email: form.email,
          tenant_id: Number(form.tenant_id),
        },
      }),
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setForm({
        cnpj: "",
        razao_social: "",
        email: "",
        tenant_id: "",
      });
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled =
    !form.cnpj || !form.razao_social || !form.email || !form.tenant_id || mut.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Novo cliente
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-lg"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            mut.mutate();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Cadastrar cliente</DialogTitle>
          <DialogDescription>
            Cadastra a empresa e o tenant do PABX. O login de acesso é criado separadamente em{" "}
            <strong>Administração → Usuários</strong> e vinculado por este Tenant ID.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome / Razão social</Label>
            <Input
              value={form.razao_social}
              onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
            />
          </div>
          <div>
            <Label>CPF / CNPJ</Label>
            <Input
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div>
            <Label>Tenant ID (PABX)</Label>
            <Input
              type="number"
              value={form.tenant_id}
              onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
              placeholder="ex: 7"
            />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => mut.mutate()}>
            {mut.isPending ? "Salvando..." : "Cadastrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditClienteDialog({ cliente, onDone }: { cliente: Cliente; onDone: () => void }) {
  const fn = useServerFn(updateCliente);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cnpj: cliente.cnpj,
    razao_social: cliente.razao_social,
    email: cliente.email,
    ativo: cliente.ativo ? 1 : 0,
  });

  const mut = useMutation({
    mutationFn: () => {
      const patch: any = { id: cliente.id };
      if (form.cnpj !== cliente.cnpj) patch.cnpj = form.cnpj;
      if (form.razao_social !== cliente.razao_social) patch.razao_social = form.razao_social;
      if (form.email !== cliente.email) patch.email = form.email;
      const novoAtivoBool = form.ativo === 1;
      if (novoAtivoBool !== Boolean(cliente.ativo)) {
        patch.ativo = novoAtivoBool;
      }
      return fn({ data: patch });
    },
    onSuccess: () => {
      toast.success("Cliente atualizado");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setForm({
            cnpj: cliente.cnpj,
            razao_social: cliente.razao_social,
            email: cliente.email,
            ativo: cliente.ativo ? 1 : 0,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-lg"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            mut.mutate();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>Tenant #{cliente.tenant_id}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome / Razão social</Label>
            <Input
              value={form.razao_social}
              onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>CPF / CNPJ</Label>
            <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
