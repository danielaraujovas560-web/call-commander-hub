import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListOrdered, RefreshCw, Users } from "lucide-react";
import { listFilas, getFilaMembros, type Fila } from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/filas")({
  head: () => ({ meta: [{ title: "Filas — Cliente — Painel PABX" }] }),
  component: FilasPage,
});

function FilasPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);
  const fn = useServerFn(listFilas);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["filas", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const [selected, setSelected] = useState<Fila | null>(null);
  const filas = data?.filas ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListOrdered className="h-6 w-6" /> Filas
          </h1>
          <p className="text-sm text-muted-foreground">Filas de atendimento configuradas.</p>
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
              <TableHead>Ramal Virtual</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead>Membros</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && filas.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma fila cadastrada.</TableCell></TableRow>
            )}
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono">{f.virtual_extension}</TableCell>
                <TableCell>{f.display_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.description ?? "-"}</TableCell>
                <TableCell>{f.strategy ?? "-"}</TableCell>
                <TableCell>{f.membros}</TableCell>
                <TableCell>
                  <Badge variant={f.active ? "default" : "secondary"}>{f.active ? "Sim" : "Não"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(f)}>
                    <Users className="h-4 w-4 mr-1" /> Ver ramais
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <MembrosDialog
          tenantId={tenantId}
          fila={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function MembrosDialog({
  tenantId, fila, onClose,
}: { tenantId: number; fila: Fila; onClose: () => void }) {
  const fn = useServerFn(getFilaMembros);
  const { data, isLoading, error } = useQuery({
    queryKey: ["fila-membros", tenantId, fila.virtual_extension],
    queryFn: () => fn({ data: { tenant_id: tenantId, virtual_extension: fila.virtual_extension } }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {fila.display_name}{" "}
            <span className="text-muted-foreground font-mono text-sm">({fila.virtual_extension})</span>
          </DialogTitle>
          <DialogDescription>
            Fila <code className="font-mono">{fila.name}</code>
            {fila.description ? ` — ${fila.description}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-4 max-h-[70vh] overflow-auto">
            {data.queue && (
              <section>
                <h4 className="font-semibold text-sm mb-1">Configuração (queues)</h4>
                <div className="grid grid-cols-3 gap-2 text-xs rounded-md border p-3 bg-muted/30">
                  <Info label="Strategy" value={data.queue.strategy} />
                  <Info label="Timeout" value={data.queue.timeout} />
                  <Info label="Retry" value={data.queue.retry} />
                  <Info label="Wrapup" value={data.queue.wrapuptime} />
                  <Info label="Max len" value={data.queue.maxlen} />
                  <Info label="MOH" value={data.queue.musiconhold} />
                </div>
              </section>
            )}

            <section>
              <h4 className="font-semibold text-sm mb-1">
                Agentes em filas_ramais ({data.agentes?.length ?? 0})
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do ramal</TableHead>
                      <TableHead>Ramal</TableHead>
                      <TableHead>Display</TableHead>
                      <TableHead>Fila</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.agentes ?? []).map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.nome_ramal ?? "-"}</TableCell>
                        <TableCell className="font-mono">{a.ramal ?? "-"}</TableCell>
                        <TableCell>{a.ramal_display ?? "-"}</TableCell>
                        <TableCell className="font-mono">{a.fila_ramal}</TableCell>
                      </TableRow>
                    ))}
                    {(!data.agentes || data.agentes.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          Nenhum agente vinculado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">
                queue_members ({data.queue_members?.length ?? 0})
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Penalty</TableHead>
                      <TableHead>Paused</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.queue_members ?? []).map((m: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{m.interface}</TableCell>
                        <TableCell>{m.membername ?? "-"}</TableCell>
                        <TableCell>{m.penalty ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={m.paused ? "secondary" : "default"}>
                            {m.paused ? `Pausado${m.reason_paused ? ` (${m.reason_paused})` : ""}` : "Ativo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!data.queue_members || data.queue_members.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          Nenhum membro em queue_members.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono">{value == null || value === "" ? "-" : String(value)}</div>
    </div>
  );
}
