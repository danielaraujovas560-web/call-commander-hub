import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { MapPin, Map, PhoneIncoming, PhoneOutgoing, ChevronLeft, ChevronRight, Icon } from "lucide-react";
import { PodiumIcon } from "@/components/podium";
import { listCdrCidadesEntrada, listCdrCidadesSaida } from "@/lib/ramais.functions";
import { ReportFilters, type ReportFilterValues, usePersistentFilter } from "@/components/report-filters";
import { statusOptions, getStatusLabel } from "@/lib/report-labels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapaBrasil, type EstadoData } from "@/components/mapa-brasil";
import { Button } from "@/components/ui/button";
import { RankCard } from "@/components/RankCard";
import { tipoOptionsMapaDDD } from "@/lib/report-labels";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatarDataHora } from "@/lib/utils";

function getTodayFilters(): ReportFilterValues {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const todayStr = `${year}-${month}-${day}`;

  return {
    from: `${todayStr}T00:00`,
    to: `${todayStr}T${hours}:${minutes}`
  };
}

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios/ddd")({
  head: () => ({ meta: [{ title: "Relatório por DDD — Painel PABX" }] }),
  component: Page,
});

function Page() {
  const { tenantId: p } = Route.useParams();
  const tenantId = Number(p);

  // Filtros independentes
  const [fMapa, setFMapa] = usePersistentFilter("fMapa", tenantId, getTodayFilters());
  const [fEnt, setFEnt] = usePersistentFilter("fEnt", tenantId, getTodayFilters());
  const [fSai, setFSai] = usePersistentFilter("fSai", tenantId, getTodayFilters());
  const [fRank, setFRank] = usePersistentFilter("fRank", tenantId, getTodayFilters());

  const [fRankAtendidas, setFRankAtendidas] = usePersistentFilter("fRankAtendidas", tenantId, getTodayFilters());

  const [pageEnt, setPageEnt] = useState(1);
  const [pageSai, setPageSai] = useState(1);

  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);
  const [pageUf, setPageUf] = useState(1);
  const [tipoUf, setTipoUf] = useState<"entrada" | "saida">("entrada");

  const entFn = useServerFn(listCdrCidadesEntrada);
  const saiFn = useServerFn(listCdrCidadesSaida);

  // --- QUERIES DO MAPA ---
  const mapEnt = useQuery({ 
    queryKey: ["mapa_entrada", tenantId, fMapa], 
    queryFn: () => entFn({ data: { tenant_id: tenantId, ...fMapa } }) 
  });
  const mapSai = useQuery({ 
    queryKey: ["mapa_saida", tenantId, fMapa], 
    queryFn: () => saiFn({ data: { tenant_id: tenantId, ...fMapa } }) 
  });

  const queryDetalheUf = useQuery({
    queryKey: ["mapa_detalhe_uf", tenantId, fMapa, ufSelecionada, pageUf, tipoUf],
    queryFn: () => {
      const fn = tipoUf === "entrada" ? entFn : saiFn;
      // Reutiliza os filtros do mapa (fMapa) mas injeta a UF clicada e a página
      return fn({ data: { ...fMapa, tenant_id: tenantId, page: pageUf, limit: 15, sigla_estado: ufSelecionada } });
    },
    enabled: !!ufSelecionada, // Só faz o fetch se tiver uma UF selecionada!
  });

  // --- QUERIES DAS TABELAS ---
  const ent = useQuery({ 
    queryKey: ["cdr_cidades_entrada", tenantId, fEnt, pageEnt], 
    queryFn: () => entFn({ data: { tenant_id: tenantId, page: pageEnt, ...fEnt } }) 
  });
  const sai = useQuery({ 
    queryKey: ["cdr_cidades_saida", tenantId, fSai, pageSai], 
    queryFn: () => saiFn({ data: { tenant_id: tenantId, page: pageSai, ...fSai } }) 
  });

  // --- QUERIES DO RANK DDD ---
  const rankEntrada = useQuery({
  queryKey: ["rank_entrada", tenantId, fRank],
  queryFn: () => entFn({ data: { tenant_id: tenantId, ...fRank, rank: true, } })
  });

  const rankSaida = useQuery({
  queryKey: ["rank_saida", tenantId, fRank],
  queryFn: () => saiFn({ data: { tenant_id: tenantId, ...fRank, rank: true }  }),
  });

  const rankEntradaAtendidas = useQuery({
    queryKey: ["rank_entrada_atendidas", tenantId, fRankAtendidas],
    queryFn: () => entFn({ data: { tenant_id: tenantId, ...fRankAtendidas, rank: true, status: "ANSWER" } }),
  });

  const rankSaidaAtendidas = useQuery({
    queryKey: ["rank_saida_atendidas", tenantId, fRankAtendidas],
    queryFn: () => saiFn({ data: { tenant_id: tenantId, ...fRankAtendidas, rank: true, status: "ANSWER" } }),
  });

  // --- TRATAMENTO DE DADOS (MAPA) ---
  const rowsMapaEnt = useMemo(() => {
    if (Array.isArray(mapEnt.data?.rows)) return mapEnt.data.rows;
    if (Array.isArray(mapEnt.data?.data)) return mapEnt.data.data;
    if (Array.isArray(mapEnt.data)) return mapEnt.data;
    return [];
  }, [mapEnt.data]);

  const rowsMapaSai = useMemo(() => {
    if (Array.isArray(mapSai.data?.rows)) return mapSai.data.rows;
    if (Array.isArray(mapSai.data?.data)) return mapSai.data.data;
    if (Array.isArray(mapSai.data)) return mapSai.data;
    return [];
  }, [mapSai.data]);

  const rowsDetalheUf = useMemo(() => {
    if (!queryDetalheUf.data) return [];
    if (Array.isArray(queryDetalheUf.data?.rows)) return queryDetalheUf.data.rows;
    if (Array.isArray(queryDetalheUf.data?.data)) return queryDetalheUf.data.data;
    if (Array.isArray(queryDetalheUf.data)) return queryDetalheUf.data;
    return [];
  }, [queryDetalheUf.data]);

  // --- TRATAMENTO DE DADOS (TABELAS) ---
  const rowsEntrada = useMemo(() => {
    if (Array.isArray(ent.data?.rows)) return ent.data.rows;
    if (Array.isArray(ent.data?.data)) return ent.data.data;
    if (Array.isArray(ent.data)) return ent.data;
    return [];
  }, [ent.data]);

  const rowsSaida = useMemo(() => {
    if (Array.isArray(sai.data?.rows)) return sai.data.rows;
    if (Array.isArray(sai.data?.data)) return sai.data.data;
    if (Array.isArray(sai.data)) return sai.data;
    return [];
  }, [sai.data]);

  // --- TRATAMENTO DE DADOS RANK DDD ---
  const rowsRankEnt = useMemo(() => {
    if (Array.isArray(rankEntrada.data?.rows)) return rankEntrada.data.rows;
    if (Array.isArray(rankEntrada.data?.data)) return rankEntrada.data.data;
    if (Array.isArray(rankEntrada.data)) return rankEntrada.data;
    return [];
  }, [rankEntrada.data]);

  const rowsRankSai = useMemo(() => {
    if (Array.isArray(rankSaida.data?.rows)) return rankSaida.data.rows;
    if (Array.isArray(rankSaida.data?.data)) return rankSaida.data.data;
    if (Array.isArray(rankSaida.data)) return rankSaida.data;
    return [];
  }, [rankSaida.data]);

const rowsRankEntAtendidas = useMemo(() => {
    if (Array.isArray(rankEntradaAtendidas.data?.rows)) return rankEntradaAtendidas.data.rows;
    if (Array.isArray(rankEntradaAtendidas.data?.data)) return rankEntradaAtendidas.data.data;
    if (Array.isArray(rankEntradaAtendidas.data)) return rankEntradaAtendidas.data;
    return [];
  }, [rankEntradaAtendidas.data]);

const rowsRankSaiAtendidas = useMemo(() => {
    if (Array.isArray(rankSaidaAtendidas.data?.rows)) return rankSaidaAtendidas.data.rows;
    if (Array.isArray(rankSaidaAtendidas.data?.data)) return rankSaidaAtendidas.data.data;
    if (Array.isArray(rankSaidaAtendidas.data)) return rankSaidaAtendidas.data;
    return [];
  }, [rankSaidaAtendidas.data]);

  // --- AGRUPAMENTO PRO MAPA ---
  const mapaData = useMemo(() => {
    const map: Record<string, EstadoData> = {};

    rowsMapaEnt.forEach((r: any) => {
      const uf = String(r?.sigla_estado || r?.uf || "").trim().toUpperCase();
      if (!uf) return;
      if (!map[uf]) map[uf] = { entrada: 0, saida: 0 };
      map[uf].entrada += 1;
    });

    rowsMapaSai.forEach((r: any) => {
      const uf = String(r?.sigla_estado || r?.uf || "").trim().toUpperCase();
      if (!uf) return;
      if (!map[uf]) map[uf] = { entrada: 0, saida: 0 };
      map[uf].saida += 1;
    });

    return map;
  }, [rowsMapaEnt, rowsMapaSai]);

  return (
    <div className="w-full max-w-full space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 w-full">
        <MapPin className="h-6 w-6" /> Relatório — Por DDD
      </h1>

      <Tabs defaultValue="mapa" className="w-full space-y-4">
        <TabsList>
          <TabsTrigger value="mapa" className="flex items-center gap-2">
            <Map className="h-4 w-4" /> Visão Geral (Mapa)
          </TabsTrigger>
          <TabsTrigger value="rank" className="flex items-center gap-2">
            <PodiumIcon className="h-4 w-4" /> Rank
          </TabsTrigger>
          <TabsTrigger value="entrada" className="flex items-center gap-2">
            <PhoneIncoming className="h-4 w-4" /> Entrada
          </TabsTrigger>
          <TabsTrigger value="saida" className="flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4" /> Saída
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: MAPA */}
        <TabsContent value="mapa" className="w-full">
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-full bg-card rounded-lg border p-4 shadow-sm">
              <ReportFilters
                storageKey="fMapa"
                tenantId={tenantId}
                initialValues={fMapa}
                defaultValues={getTodayFilters()}
                showLimit={false}
                onApply={(valores) => setFMapa({ ...getTodayFilters(), ...valores })}
                fields={[
                  { key: "status", label: "Status", options: statusOptions },
                  { key: "tipo", label: "Tipo", options: tipoOptionsMapaDDD },
                  { key: "from", label: "Data/Hora Inicial", type: "datetime-local" },
                  { key: "to", label: "Data/Hora Final", type: "datetime-local" }
                ]}
              />
            </div>
            <div className="rounded-md border bg-card p-4 overflow-hidden w-full">
              <MapaBrasil data={mapaData} onSelectState={(uf) => { setUfSelecionada(uf); setPageUf(1);}}/>
            </div>
             {ufSelecionada && (
              <div className="w-full bg-card rounded-lg border shadow-sm overflow-hidden mt-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Detalhamento - {ufSelecionada}
                  </h3>
                  
                  <div className="flex items-center gap-4">
                    {/* Botões para alternar entre Entrada/Saída desse Estado */}
                    <div className="flex bg-muted rounded-md p-1">
                      <Button 
                        variant={tipoUf === "entrada" ? "default" : "ghost"} 
                        size="sm" 
                        onClick={() => { setTipoUf("entrada"); setPageUf(1); }}
                      >
                        Entrada
                      </Button>
                      <Button 
                        variant={tipoUf === "saida" ? "default" : "ghost"} 
                        size="sm" 
                        onClick={() => { setTipoUf("saida"); setPageUf(1); }}
                      >
                        Saída
                      </Button>
                    </div>
                    
                    <Button variant="ghost" size="sm" onClick={() => setUfSelecionada(null)}>
                      Fechar (X)
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DDD</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryDetalheUf.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Buscando chamadas de {ufSelecionada}...
                        </TableCell>
                      </TableRow>
                    ) : rowsDetalheUf.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum registro encontrado para {ufSelecionada}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rowsDetalheUf.map((r: any, idx: number) => (
                        <TableRow key={r.id || idx}>
                          <TableCell className="font-medium">{r.ddd}</TableCell>
                          <TableCell>{r.numero}</TableCell>
                          <TableCell>{formatarDataHora(r.data_hora)}</TableCell>
                          <TableCell>{getStatusLabel(r.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* PAGINAÇÃO DA UF */}
                <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
                  <span className="text-sm text-muted-foreground">
                    Total: <strong>{queryDetalheUf.data?.total ?? rowsDetalheUf.length}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={pageUf <= 1 || queryDetalheUf.isLoading}
                      onClick={() => setPageUf((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">Página {pageUf}</span>
                    <Button
                      variant="outline" size="sm"
                      disabled={pageUf >= (queryDetalheUf.data?.totalPages ?? 1) || queryDetalheUf.isLoading}
                      onClick={() => setPageUf((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ABA 2: ENTRADA */}
        <TabsContent value="entrada">
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-full bg-card rounded-lg border p-4 shadow-sm">
              <ReportFilters
                storageKey="fEnt"
                tenantId={tenantId}
                initialValues={fEnt}
                defaultValues={getTodayFilters()}
                onApply={(valores) => {
                  setPageEnt(1); 
                  setFEnt({ ...getTodayFilters(), ...valores });
                }}
                fields={[
                  { key: "status", label: "Status", options: statusOptions },
                  { key: "from", label: "Data/Hora Inicial", type: "datetime-local" },
                  { key: "to", label: "Data/Hora Final", type: "datetime-local" }
                ]}
              />
            </div>

            <div className="rounded-lg border bg-card overflow-hidden w-full shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DDD</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ent.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        Carregando registros de entrada...
                      </TableCell>
                    </TableRow>
                  ) : rowsEntrada.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        Nenhum registro de entrada encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsEntrada.map((r: any, idx: number) => (
                      <TableRow key={r.id || idx}>
                        <TableCell className="font-medium">{r.ddd}</TableCell>
                        <TableCell>{r.estado}</TableCell>
                        <TableCell>{r.sigla_estado}</TableCell>
                        <TableCell>{r.numero}</TableCell>
                        <TableCell>{formatarDataHora(r.data_hora)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* PAGINAÇÃO DE ENTRADA */}
              <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
                <span className="text-sm text-muted-foreground">
                  Total de registros: <strong>{ent.data?.total ?? rowsEntrada.length}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageEnt <= 1 || ent.isLoading}
                    onClick={() => setPageEnt((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>

                  <span className="text-sm">
                    Página <strong>{pageEnt}</strong> de{" "}
                    <strong>{ent.data?.totalPages ?? 1}</strong>
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageEnt >= (ent.data?.totalPages ?? 1) || ent.isLoading}
                    onClick={() => setPageEnt((p) => Math.min(ent.data?.totalPages ?? 1, p + 1))}
                  >
                    Próxima <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rank">
          <Tabs defaultValue="geral">
           <div className="flex justify-center">
            <TabsList>
               <TabsTrigger value="geral">Geral</TabsTrigger>
               <TabsTrigger value="atendidas">Atendidas</TabsTrigger>
               <TabsTrigger value="discadas">Mais Discados</TabsTrigger>
            {/*   <TabsTrigger value="ramais">Ramais</TabsTrigger>*/}
            </TabsList>
           </div>

           <TabsContent value="geral">
            <div className="space-y-6">
            <div className="w-full bg-card rounded-lg border p-4 shadow-sm">
              <ReportFilters
                storageKey="fRank"
                tenantId={tenantId}
                initialValues={fRank}
                defaultValues={getTodayFilters()}
                showLimit={false}
                onApply={(valores) => setFRank(valores)}
                fields={[
                  { key: "from", label: "Data/Hora Inicial", type: "datetime-local" },
                  { key: "to", label: "Data/Hora Final", type: "datetime-local" }
                ]}
              />
            </div>

             <RankCard
               titulo="Entrada"
               descricao="Top 5 DDDs com maior volume de chamadas de entrada"
               dados={rowsRankEnt}
               Icon={PhoneIncoming}
               iconColor="text-emerald-500"
              />

              <RankCard
                titulo="Saída"
                descricao="Top 5 DDDs com maior volume de chamadas de saída"
                dados={rowsRankSai}
                Icon={PhoneOutgoing}
                iconColor="text-blue-500"
              />

            </div>
          </TabsContent>

          <TabsContent value="atendidas">
            <div className="space-y-6">
            <div className="w-full bg-card rounded-lg border p-4 shadow-sm">
              <ReportFilters
                storageKey="fRankAtendidas"
                tenantId={tenantId}
                initialValues={fRankAtendidas}
                defaultValues={getTodayFilters()}
                showLimit={false}
                onApply={(valores) => setFRankAtendidas(valores)}
                fields={[
                  { key: "from", label: "Data/Hora Inicial", type: "datetime-local" },
                  { key: "to", label: "Data/Hora Final", type: "datetime-local" }
                ]}
              />
            </div>

             <RankCard
               titulo="Entrada"
               descricao="Top 5 DDDs com maior índice de atendimento de entrada"
               dados={rowsRankEntAtendidas}
               Icon={PhoneIncoming}
               iconColor="text-emerald-500"
              />

              <RankCard
                titulo="Saída"
                descricao="Top 5 DDDs com maior índice de atendimento de saída"
                dados={rowsRankSaiAtendidas}
                Icon={PhoneOutgoing}
                iconColor="text-blue-500"
              />

            </div>
          </TabsContent>

          <TabsContent value="discadas">
             Em desenvolvimento...
          </TabsContent>

        </Tabs>
     </TabsContent>

        {/* ABA 4: SAÍDA */}
        <TabsContent value="saida">
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-full bg-card rounded-lg border p-4 shadow-sm">
              <ReportFilters
                storageKey="fSai"
                tenantId={tenantId}
                initialValues={fSai}
                defaultValues={getTodayFilters()}
                onApply={(valores) => {
                  setPageSai(1); 
                  setFSai({ ...getTodayFilters(), ...valores });
                }}
                fields={[                                   
                  { key: "status", label: "Status", options: statusOptions },
                  { key: "from", label: "Data/Hora Inicial", type: "datetime-local" },
                  { key: "to", label: "Data/Hora Final", type: "datetime-local" }
                ]}
              />
            </div>

            <div className="rounded-lg border bg-card overflow-hidden w-full shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DDD</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sai.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        Carregando registros de saída...
                      </TableCell>
                    </TableRow>
                  ) : rowsSaida.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        Nenhum registro de saída encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsSaida.map((r: any, idx: number) => (
                      <TableRow key={r.id || idx}>
                        <TableCell className="font-medium">{r.ddd}</TableCell>
                        <TableCell>{r.estado}</TableCell>
                        <TableCell>{r.sigla_estado}</TableCell>
                        <TableCell>{r.numero}</TableCell>
                        <TableCell>{getStatusLabel(r.status)}</TableCell>
                        <TableCell>{formatarDataHora(r.data_hora)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* PAGINAÇÃO DE SAÍDA CORRIGIDA */}
              <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
                <span className="text-sm text-muted-foreground">
                  Total de registros: <strong>{sai.data?.total ?? rowsSaida.length}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSai <= 1 || sai.isLoading}
                    onClick={() => setPageSai((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>

                  <span className="text-sm">
                    Página <strong>{pageSai}</strong> de{" "}
                    <strong>{sai.data?.totalPages ?? 1}</strong>
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSai >= (sai.data?.totalPages ?? 1) || sai.isLoading}
                    onClick={() => setPageSai((p) => Math.min(sai.data?.totalPages ?? 1, p + 1))}
                  >
                    Próxima <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
