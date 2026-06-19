import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  type Cliente,
} from "@/lib/clientes.functions";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Building2, LogIn, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({
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
              <TableHead>Razão social</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Ramais</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && clientes.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-10"
                >
                  Nenhum cliente cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {clientes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.razao_social}</TableCell>
                <TableCell className="font-mono text-xs">{c.cnpj}</TableCell>
                <TableCell>#{c.tenant_id}</TableCell>
                <TableCell className="font-mono text-xs">{c.email}</TableCell>
                <TableCell className="text-right">{c.quantidade_ramais}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/clientes/$tenantId"
                        params={{ tenantId: String(c.tenant_id) }}
                      >
                        <LogIn className="mr-1 h-3 w-3" />
                        Acessar
                      </Link>
                    </Button>
                    {isAdmin && (
                      <>
                        <EditClienteDialog cliente={c} onDone={invalidate} />
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

function DeleteButton({
  cliente,
  onDone,
}: {
  cliente: Cliente;
  onDone: () => void;
}) {
  const fn = useServerFn(deleteCliente);
  const mut = useMutation({
    mutationFn: () => fn({ data: { id: cliente.id } }),
    onSuccess: () => {
      toast.success("Cliente removido");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (confirm(`Remover cliente "${cliente.razao_social}"?`)) mut.mutate();
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
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
    quantidade_ramais: "0",
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          cnpj: form.cnpj,
          razao_social: form.razao_social,
          email: form.email,
          tenant_id: Number(form.tenant_id),
          quantidade_ramais: Number(form.quantidade_ramais) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setForm({
        cnpj: "",
        razao_social: "",
        email: "",
        tenant_id: "",
        quantidade_ramais: "0",
      });
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled =
    !form.cnpj ||
    !form.razao_social ||
    !form.email ||
    !form.tenant_id ||
    mut.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Novo cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar cliente</DialogTitle>
          <DialogDescription>
            Cadastra a empresa e o tenant do PABX. O login de acesso é criado
            separadamente em <strong>Administração → Usuários</strong> e
            vinculado por este Tenant ID.
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
          <div>
            <Label>Qtd. de ramais</Label>
            <Input
              type="number"
              value={form.quantidade_ramais}
              onChange={(e) =>
                setForm({ ...form, quantidade_ramais: e.target.value })
              }
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

function EditClienteDialog({
  cliente,
  onDone,
}: {
  cliente: Cliente;
  onDone: () => void;
}) {
  const fn = useServerFn(updateCliente);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cnpj: cliente.cnpj,
    razao_social: cliente.razao_social,
    email: cliente.email,
    quantidade_ramais: String(cliente.quantidade_ramais),
  });

  const mut = useMutation({
    mutationFn: () => {
      const patch: any = { id: cliente.id };
      if (form.cnpj !== cliente.cnpj) patch.cnpj = form.cnpj;
      if (form.razao_social !== cliente.razao_social)
        patch.razao_social = form.razao_social;
      if (form.email !== cliente.email) patch.email = form.email;
      if (Number(form.quantidade_ramais) !== cliente.quantidade_ramais)
        patch.quantidade_ramais = Number(form.quantidade_ramais);
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
            quantidade_ramais: String(cliente.quantidade_ramais),
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
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
          <div>
            <Label>CPF / CNPJ</Label>
            <Input
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            />
          </div>
          <div>
            <Label>Qtd. de ramais</Label>
            <Input
              type="number"
              value={form.quantidade_ramais}
              onChange={(e) =>
                setForm({ ...form, quantidade_ramais: e.target.value })
              }
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
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
