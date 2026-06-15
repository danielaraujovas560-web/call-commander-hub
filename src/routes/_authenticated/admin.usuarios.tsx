import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listUsers,
  createUser,
  deleteUser,
  setRole,
  addTenantLink,
  removeTenantLink,
} from "@/lib/admin.functions";
import { AppShell } from "@/components/app-shell";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, ShieldCheck, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({ meta: [{ title: "Administração — Usuários" }] }),
  component: Page,
});

function Page() {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading) return <AppShell><p>Carregando…</p></AppShell>;
  if (!isAdmin)
    return (
      <AppShell>
        <p className="text-destructive">Acesso restrito a administradores.</p>
      </AppShell>
    );
  return (
    <AppShell>
      <UsersAdmin />
    </AppShell>
  );
}

function UsersAdmin() {
  const fetchUsers = useServerFn(listUsers);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers({}),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">
            Crie usuários, ajuste perfis e vincule tenants do PABX.
          </p>
        </div>
        <NewUserDialog onDone={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
      </div>

      {isLoading ? (
        <p>Carregando…</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Tenants</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onChange={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type UserRowProps = {
  user: {
    id: string;
    email: string | undefined;
    nome: string | null;
    role: "admin" | "cliente";
    tenants: { tenant_id: number; label: string | null; is_default: boolean }[];
  };
  onChange: () => void;
};

function UserRow({ user, onChange }: UserRowProps) {
  const setRoleFn = useServerFn(setRole);
  const deleteFn = useServerFn(deleteUser);

  const roleMut = useMutation({
    mutationFn: (role: "admin" | "cliente") =>
      setRoleFn({ data: { user_id: user.id, role } }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { user_id: user.id } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{user.email}</TableCell>
      <TableCell>{user.nome ?? "—"}</TableCell>
      <TableCell>
        <Select
          value={user.role}
          onValueChange={(v) => roleMut.mutate(v as "admin" | "cliente")}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> admin
              </span>
            </SelectItem>
            <SelectItem value="cliente">cliente</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <TenantCell userId={user.id} tenants={user.tenants} onChange={onChange} />
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (confirm(`Remover ${user.email}?`)) delMut.mutate();
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TenantCell({
  userId,
  tenants,
  onChange,
}: {
  userId: string;
  tenants: { tenant_id: number; label: string | null; is_default: boolean }[];
  onChange: () => void;
}) {
  const addFn = useServerFn(addTenantLink);
  const removeFn = useServerFn(removeTenantLink);
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [label, setLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const addMut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          user_id: userId,
          tenant_id: Number(tenantId),
          label: label || undefined,
          is_default: isDefault,
        },
      }),
    onSuccess: () => {
      toast.success("Tenant vinculado");
      setTenantId("");
      setLabel("");
      setIsDefault(false);
      setOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (tid: number) => removeFn({ data: { user_id: userId, tenant_id: tid } }),
    onSuccess: () => {
      toast.success("Vínculo removido");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tenants.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
      {tenants.map((t) => (
        <Badge
          key={t.tenant_id}
          variant={t.is_default ? "default" : "secondary"}
          className="gap-1"
        >
          {t.label ? `${t.label} (#${t.tenant_id})` : `#${t.tenant_id}`}
          <button
            type="button"
            className="ml-1 opacity-70 hover:opacity-100"
            onClick={() => removeMut.mutate(t.tenant_id)}
          >
            ×
          </button>
        </Badge>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-2">
            <Plus className="h-3 w-3" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular tenant</DialogTitle>
            <DialogDescription>
              Associa este usuário a um tenant_id existente no PABX.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tenant ID</Label>
              <Input
                type="number"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="ex: 7"
              />
            </div>
            <div>
              <Label>Rótulo (opcional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Empresa X"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Definir como padrão
            </label>
          </div>
          <DialogFooter>
            <Button
              disabled={!tenantId || addMut.isPending}
              onClick={() => addMut.mutate()}
            >
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewUserDialog({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(createUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    nome: "",
    role: "cliente" as "admin" | "cliente",
    tenant_id: "",
    tenant_label: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          email: form.email,
          password: form.password,
          nome: form.nome,
          role: form.role,
          tenant_id: form.tenant_id ? Number(form.tenant_id) : undefined,
          tenant_label: form.tenant_label || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setForm({
        email: "",
        password: "",
        nome: "",
        role: "cliente",
        tenant_id: "",
        tenant_label: "",
      });
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar usuário</DialogTitle>
          <DialogDescription>
            O usuário receberá acesso imediato (email já confirmado).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="mín. 8 caracteres"
            />
          </div>
          <div>
            <Label>Perfil</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as "admin" | "cliente" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cliente">cliente</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenant ID (opcional)</Label>
              <Input
                type="number"
                value={form.tenant_id}
                onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                placeholder="ex: 7"
              />
            </div>
            <div>
              <Label>Rótulo</Label>
              <Input
                value={form.tenant_label}
                onChange={(e) => setForm({ ...form, tenant_label: e.target.value })}
                placeholder="Empresa X"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.email || !form.password || !form.nome || mut.isPending}
            onClick={() => mut.mutate()}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
