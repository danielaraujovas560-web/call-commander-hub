import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Ban, Plus, Search, Trash2, ShieldBan } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { createFirewall, deleteFirewall, listFirewall } from "@/lib/ramais.functions";

export const Route = createFileRoute("/_authenticated/admin/blacklist")({
  head: () => ({ meta: [{ title: "BlackList — Painel PABX" }] }),
  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async () => {
    return await listFirewall();
  },
  component: BlacklistPage,
});

function BlacklistPage() {
  const { firewall } = Route.useLoaderData();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const blacklist = useMemo(() => {
    return firewall.filter((item) => item.tipo === "BLACKLIST");
  }, [firewall]);

  const filteredBlacklist = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) {
      return blacklist;
    }

    return blacklist.filter(
      (item) =>
        item.ip.toLowerCase().includes(value) ||
        item.motivo?.toLowerCase().includes(value) ||
        item.origem.toLowerCase().includes(value),
    );
  }, [blacklist, search]);

  async function handleCreate() {
    if (!ip.trim()) return;

    try {
      setLoading(true);

      await createFirewall({
        data: {
          ip: ip.trim(),
          tipo: "BLACKLIST",
          motivo: motivo.trim() || undefined,
        },
      });

      setIp("");
      setMotivo("");
      setOpen(false);

      await router.invalidate();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, ip: string, tipo: "BLACKLIST") {
    try {
      await deleteFirewall({
        data: { id, ip, tipo },
      });

      await router.invalidate();
    } catch (error) {
      console.error("Erro ao remover IP da blacklist:", error);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40">
            <ShieldBan className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Blacklist</h1>

            <p className="text-sm text-muted-foreground">
              Gerencie os endereços IP bloqueados pelo firewall.
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar IP
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar IP à blacklist</DialogTitle>

              <DialogDescription>
                O endereço será bloqueado pelo firewall do servidor.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ip">Endereço IP</Label>

                <Input
                  id="ip"
                  placeholder="Ex.: 192.168.1.100"
                  value={ip}
                  onChange={(event) => setIp(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="motivo">
                  Motivo <span className="text-muted-foreground">(opcional)</span>
                </Label>

                <Input
                  id="motivo"
                  placeholder="Ex.: IP malicioso"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </Button>

              <Button variant="destructive" onClick={handleCreate} disabled={!ip.trim() || loading}>
                <Ban className="mr-2 h-4 w-4" />
                {loading ? "Bloqueando..." : "Bloquear IP"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>IPs bloqueados</CardDescription>

            <CardTitle className="text-2xl">{blacklist.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bloqueios automáticos</CardDescription>

            <CardTitle className="text-2xl">
              {blacklist.filter((item) => item.origem === "AUTO").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>Endereços bloqueados</CardTitle>

          <CardDescription>IPs registrados atualmente na blacklist global.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="mb-4 flex items-center">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                placeholder="Pesquisar IP ou motivo..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {filteredBlacklist.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Ban className="mb-3 h-8 w-8 text-muted-foreground" />

              <p className="font-medium">{search ? "Nenhum IP encontrado" : "Blacklist vazia"}</p>

              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? "Nenhum endereço corresponde à pesquisa."
                  : "Nenhum endereço IP está bloqueado no momento."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="h-11 px-4 text-left font-medium">Endereço IP</th>

                    <th className="h-11 px-4 text-left font-medium">Motivo</th>

                    <th className="h-11 px-4 text-left font-medium">Origem</th>

                    <th className="h-11 px-4 text-left font-medium">Status</th>

                    <th className="h-11 px-4 text-left font-medium">Adicionado em</th>

                    <th className="h-11 px-4 text-right font-medium">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBlacklist.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium">{item.ip}</span>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">{item.motivo || "—"}</td>

                      <td className="px-4 py-3">
                        <Badge variant={item.origem === "AUTO" ? "secondary" : "outline"}>
                          {item.origem === "AUTO" ? "Automático" : "Manual"}
                        </Badge>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant="destructive">Bloqueado</Badge>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(item.created_at).toLocaleString("pt-BR")}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover da blacklist"
                          onClick={() => handleDelete(item.id, item.ip, item.tipo)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
