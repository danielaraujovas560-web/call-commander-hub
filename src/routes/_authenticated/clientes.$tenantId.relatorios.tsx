import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, PhoneIncoming, PhoneCall, Star, MapPin, ListOrdered, Workflow,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  listCdrEntrada,
  listCdrRamal,
  listCdrPesquisa,
  listCdrCidadesEntrada,
  listCdrCidadesSaida,
  listCdrFila,
  listCdrUra,
} from "@/lib/ramais.functions";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Cliente — Painel PABX" }] }),
  component: RelatoriosPage,
});

function useReport(fn: any, tenantId: number, key: string) {
  const f = useServerFn(fn);
  return useQuery({
    queryKey: [key, tenantId],
    queryFn: () => f({ data: { tenant_id: tenantId } }),
  });
}

function RelatoriosPage() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-6 w-6" /> Relatórios
      </h1>

      <Tabs defaultValue="entrada" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="entrada" className="gap-2"><PhoneIncoming className="h-4 w-4" /> Entrada</TabsTrigger>
          <TabsTrigger value="ramais" className="gap-2"><PhoneCall className="h-4 w-4" /> Ramais</TabsTrigger>
          <TabsTrigger value="ddd" className="gap-2"><MapPin className="h-4 w-4" /> Por DDD</TabsTrigger>
          <TabsTrigger value="satisfacao" className="gap-2"><Star className="h-4 w-4" /> Satisfação</TabsTrigger>
        </TabsList>

        <TabsContent value="entrada" className="mt-4"><EntradaTable tenantId={tenantId} /></TabsContent>
        <TabsContent value="ramais" className="mt-4"><RamaisTable tenantId={tenantId} /></TabsContent>
        <TabsContent value="ddd" className="mt-4"><DddTables tenantId={tenantId} /></TabsContent>
        <TabsContent value="satisfacao" className="mt-4"><PesquisaTable tenantId={tenantId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ReportShell({
  loading, error, empty, children,
}: { loading?: boolean; error?: Error | null; empty?: boolean; children: React.ReactNode }) {
  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;
  if (error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </div>
    );
  if (empty) return <div className="text-sm text-muted-foreground py-6 text-center">Sem registros.</div>;
  return <>{children}</>;
}

function EntradaTable({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useReport(listCdrEntrada, tenantId, "cdr_entrada");
  const rows = data?.rows ?? [];
  return (
    <div className="rounded-md border bg-card">
      <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
              <TableHead>Dest. interno</TableHead><TableHead>Duração</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.date_time}</TableCell>
                <TableCell className="font-mono">{r.origem}</TableCell>
                <TableCell className="font-mono">{r.num_destino}</TableCell>
                <TableCell>{r.dest_interno || "-"}</TableCell>
                <TableCell className="font-mono">{r.duracao}</TableCell>
                <TableCell><Badge variant={r.status === "ANSWER" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportShell>
    </div>
  );
}

function RamaisTable({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useReport(listCdrRamal, tenantId, "cdr_ramal");
  const rows = data?.rows ?? [];
  return (
    <div className="rounded-md border bg-card">
      <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
              <TableHead>Tronco</TableHead><TableHead>Contexto</TableHead><TableHead>Regra</TableHead>
              <TableHead>Duração</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.date_time}</TableCell>
                <TableCell className="font-mono">{r.origem}</TableCell>
                <TableCell className="font-mono">{r.destino}</TableCell>
                <TableCell>{r.tronco || "-"}</TableCell>
                <TableCell>{r.context}</TableCell>
                <TableCell>{r.regra}</TableCell>
                <TableCell className="font-mono">{r.duracao}</TableCell>
                <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportShell>
    </div>
  );
}

function DddTables({ tenantId }: { tenantId: number }) {
  const ent = useReport(listCdrCidadesEntrada, tenantId, "cdr_cidades_entrada");
  const sai = useReport(listCdrCidadesSaida, tenantId, "cdr_cidades_saida");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="font-semibold mb-2 text-sm">Entrada</h3>
        <DddTable rows={ent.data?.rows ?? []} loading={ent.isLoading} error={ent.error as Error | null} />
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-sm">Saída</h3>
        <DddTable rows={sai.data?.rows ?? []} loading={sai.isLoading} error={sai.error as Error | null} />
      </div>
    </div>
  );
}

function DddTable({ rows, loading, error }: { rows: any[]; loading: boolean; error: Error | null }) {
  return (
    <div className="rounded-md border bg-card">
      <ReportShell loading={loading} error={error} empty={!loading && rows.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>DDD</TableHead><TableHead>Número</TableHead><TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.ddd || "-"}</TableCell>
                <TableCell className="font-mono">{r.numero}</TableCell>
                <TableCell>{r.estado || r.sigla_estado || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportShell>
    </div>
  );
}

function PesquisaTable({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useReport(listCdrPesquisa, tenantId, "cdr_pesquisa");
  const rows = data?.rows ?? [];
  return (
    <div className="rounded-md border bg-card">
      <ReportShell loading={isLoading} error={error as Error | null} empty={!isLoading && rows.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Fila</TableHead>
              <TableHead>Agente</TableHead><TableHead>Ramal</TableHead>
              <TableHead>Pergunta</TableHead><TableHead>Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.data}</TableCell>
                <TableCell className="font-mono">{r.numero_origem}</TableCell>
                <TableCell>{r.nome_fila}</TableCell>
                <TableCell>{r.agente}</TableCell>
                <TableCell className="font-mono">{r.ramal}</TableCell>
                <TableCell>#{r.pergunta_id}</TableCell>
                <TableCell><Badge>{r.nota}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportShell>
    </div>
  );
}
