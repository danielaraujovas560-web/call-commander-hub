import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Workflow, RefreshCw, ListTree } from "lucide-react";
import { listUras, type Ura } from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/uras")({
  head: () => ({ meta: [{ title: "URAs — Cliente — Painel PABX" }] }),
  component: UrasPage,
});

function UrasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listUras);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["uras", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const [selected, setSelected] = useState<Ura | null>(null);
  const uras = data?.uras ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6" /> URAs
          </h1>
          <p className="text-sm text-muted-foreground">URAs configuradas para este cliente.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
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
              <TableHead>Máx. dígitos</TableHead>
              <TableHead>Tentativas</TableHead>
              <TableHead>Timeout (s)</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && uras.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma URA cadastrada.</TableCell></TableRow>
            )}
            {uras.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell>{u.max_digits ?? "-"}</TableCell>
                <TableCell>{u.tentativas ?? "-"}</TableCell>
                <TableCell>{u.timeout ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Sim" : "Não"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(u)}>
                    <ListTree className="h-4 w-4 mr-1" /> Opções
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selected.nome}</DialogTitle>
              <DialogDescription>Opções configuradas em ura_opcoes.</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dígito</TableHead>
                    <TableHead>Tipo destino</TableHead>
                    <TableHead>Destino</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selected.opcoes ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono">{o.digito || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{o.tipo_destino}</Badge></TableCell>
                      <TableCell>{o.destino}</TableCell>
                    </TableRow>
                  ))}
                  {(!selected.opcoes || selected.opcoes.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        Sem opções.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
