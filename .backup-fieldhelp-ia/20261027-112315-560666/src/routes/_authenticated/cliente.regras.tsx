import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, ListFilter, Route as RouteIcon, Cable, RefreshCw, Plus, Pencil, Trash2, HelpCircle, Copy, Search, Layers3, CheckCheck, Hash } from "lucide-react";
import { listRegras, createRegras, updateRegras, deleteRegras, deleteRegrasLote, createRegrasPredefinidas, type Regra as RegraApi } from "@/lib/regras.functions";
import { listTroncos, type Tronco } from "@/lib/troncos.functions";
import { SimuladorRegra, type Regra, type Modelo } from "@/components/simulador-regra";
import { useClienteContext } from "@/context/cliente-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/cliente/regras")({
  head: () => ({ meta: [{ title: "Regras — Cliente — Painel PABX" }] }),
  component: RouteComponent,
});

type FormRegra = {
  regra_nome: string;
  tipo_ligacao: Regra["tipo_ligacao"];
  codigo_csp: string;
  expressao: string;
  expressao_transformada: string;
  prioridade: number;
};
const formularioVazio: FormRegra = { regra_nome: "", tipo_ligacao: "movel", codigo_csp: "", expressao: "", expressao_transformada: "", prioridade: 1 };
const tipoLigacaoLabel: Record<string, string> = { movel: "Móvel", fixo: "Fixo", ddi: "DDI", cng: "CNG", esp: "Especial" };

function IconButton({ title, children, onClick, disabled, destructive = false }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return <Button type="button" variant="ghost" size="icon" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`size-8 shrink-0 ${destructive ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}>{children}</Button>;
}
function StatCard({ title, value, icon: Icon, description }: { title: string; value: number | string; icon: typeof GitBranch; description: string }) {
  return <Card className="shadow-sm"><CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><div className="rounded-xl border bg-muted/40 p-3"><Icon className="size-5 text-muted-foreground" /></div></CardContent></Card>;
}
function FieldHelp({ children }: { children: ReactNode }) {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" aria-label="Ajuda" className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="size-4" /></button></TooltipTrigger><TooltipContent className="max-w-xs text-xs">{children}</TooltipContent></Tooltip></TooltipProvider>;
}

function RouteComponent() {
  const { tenantId, isLoading: carregandoCliente } = useClienteContext();
  const queryClient = useQueryClient();
  const listarRegrasFn = useServerFn(listRegras);
  const listarTroncosFn = useServerFn(listTroncos);
  const criarRegraFn = useServerFn(createRegras);
  const editarRegraFn = useServerFn(updateRegras);
  const excluirRegraFn = useServerFn(deleteRegras);
  const criarRegrasPredefinidasFn = useServerFn(createRegrasPredefinidas);
  const deleteLote = useServerFn(deleteRegrasLote);
  const [troncoSelecionado, setTroncoSelecionado] = useState("");
  const [modelo, setModelo] = useState<Modelo>("STFC");
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [regraEditando, setRegraEditando] = useState<Regra | null>(null);
  const [regraCopiando, setRegraCopiando] = useState<Regra | null>(null);
  const [form, setForm] = useState<FormRegra>({ ...formularioVazio });
  const [salvando, setSalvando] = useState(false);
  const [criandoPredefinidas, setCriandoPredefinidas] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [erroFormulario, setErroFormulario] = useState("");
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [confirmarRegra, setConfirmarRegra] = useState<Regra | null>(null);
  const [confirmarPredefinidas, setConfirmarPredefinidas] = useState<Modelo | null>(null);

  const { data: dadosRegras, isLoading: carregandoRegras, isFetching: atualizandoRegras, error: erroRegras, refetch: recarregarRegras } = useQuery({ queryKey: ["regras", tenantId], queryFn: () => listarRegrasFn({ data: { tenant_id: tenantId } }), enabled: !!tenantId });
  const { data: dadosTroncos, isLoading: carregandoTroncos, error: erroTroncos } = useQuery({ queryKey: ["troncos", tenantId, 0], queryFn: () => listarTroncosFn({ data: { tenant_id: tenantId, roteamento_simplificado: 0 } }), enabled: !!tenantId });
  const troncos: Tronco[] = dadosTroncos?.troncos ?? [];
  const regrasRecebidas: Regra[] = (dadosRegras?.regras ?? []).map((regra: RegraApi & { regra_nome?: string; tronco_nome?: string; nome?: string }) => ({ id: regra.id, tronco_identifier: regra.tronco_identifier, tronco_nome: regra.tronco_nome ?? "", regra_nome: regra.regra_nome ?? regra.nome ?? "", tipo: regra.tipo as Modelo, tipo_ligacao: regra.tipo_ligacao, codigo_csp: regra.codigo_csp ?? null, expressao: regra.expressao, expressao_transformada: regra.expressao_transformada, prioridade: regra.prioridade }));
  const primeiroTronco = troncos[0]?.tronco_pjsip ?? "";
  const troncoValue = troncos.some((t) => t.tronco_pjsip === troncoSelecionado) ? troncoSelecionado : primeiroTronco;
  const troncoAtual = troncos.find((t) => t.tronco_pjsip === troncoValue);
  const carregando = carregandoCliente || carregandoRegras || carregandoTroncos;
  const erro = erroRegras || erroTroncos;

  useEffect(() => {
    if (troncoAtual?.tipo === "STFC" || troncoAtual?.tipo === "E164") setModelo(troncoAtual.tipo);
  }, [troncoAtual?.tronco_pjsip, troncoAtual?.tipo]);
  useEffect(() => { setSelecionados([]); setModoSelecao(false); setBusca(""); }, [troncoValue, modelo]);

  const regrasDoModelo = useMemo(() => regrasRecebidas.filter((r) => r.tronco_identifier === troncoValue && r.tipo === modelo).sort((a, b) => a.prioridade - b.prioridade), [dadosRegras, troncoValue, modelo]);
  const termo = busca.trim().toLowerCase();
  const regrasVisiveis = regrasDoModelo.filter((r) => !termo || [r.regra_nome, r.tipo_ligacao, r.codigo_csp ?? "", r.expressao, r.expressao_transformada, String(r.prioridade)].some((v) => v.toLowerCase().includes(termo)));
  const tiposUsados = new Set(regrasDoModelo.map((r) => r.tipo_ligacao)).size;
  const idsVisiveis = regrasVisiveis.map((r) => r.id);
  const todosSelecionados = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.includes(id));

  const deleteLoteMutation = useMutation({
    mutationFn: ({ regras_ids, tronco_identifier, tipo }: { regras_ids: number[]; tronco_identifier: string; tipo: string }) => deleteLote({ data: { tenant_id: tenantId!, regras_ids, tronco_identifier, tipo } }),
    onSuccess: () => { toast.success(`${selecionados.length} ${selecionados.length === 1 ? "regra removida" : "regras removidas"} com sucesso.`); void queryClient.invalidateQueries({ queryKey: ["regras", tenantId] }); setSelecionados([]); setModoSelecao(false); setConfirmarExclusao(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrirNovaRegra(tipo: Modelo) { setRegraEditando(null); setRegraCopiando(null); setForm({ ...formularioVazio }); setErroFormulario(""); setModelo(tipo); setDialogAberto(true); }
  function duplicarRegra(regra: Regra) { setRegraEditando(null); setRegraCopiando(regra); setForm({ regra_nome: `${regra.regra_nome} (Cópia)`, tipo_ligacao: regra.tipo_ligacao, codigo_csp: regra.codigo_csp ?? "", expressao: regra.expressao, expressao_transformada: regra.expressao_transformada, prioridade: regra.prioridade }); setModelo(regra.tipo); setErroFormulario(""); setDialogAberto(true); }
  function abrirEdicao(regra: Regra) { setRegraEditando(regra); setRegraCopiando(null); setForm({ regra_nome: regra.regra_nome, tipo_ligacao: regra.tipo_ligacao, codigo_csp: regra.codigo_csp ?? "", expressao: regra.expressao, expressao_transformada: regra.expressao_transformada, prioridade: regra.prioridade }); setErroFormulario(""); setDialogAberto(true); }

  async function criarPredefinidas(tipo: Modelo) {
    if (!tenantId || !troncoValue || criandoPredefinidas) return;
    setCriandoPredefinidas(true);
    try { const resultado = await criarRegrasPredefinidasFn({ data: { tenant_id: tenantId, tronco_identifier: troncoValue, tipo } }); await queryClient.invalidateQueries({ queryKey: ["regras", tenantId] }); toast.success(`${resultado.total} regras predefinidas ${tipo} criadas.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar as regras predefinidas."); }
    finally { setCriandoPredefinidas(false); setConfirmarPredefinidas(null); }
  }
  async function salvarRegra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId) { setErroFormulario("Não foi possível identificar o tenant."); return; }
    if (!regraEditando && !troncoValue) { setErroFormulario("Selecione um tronco antes de criar a regra."); return; }
    if (!form.regra_nome.trim() || !form.expressao.trim() || !form.expressao_transformada.trim() || !Number.isInteger(form.prioridade) || form.prioridade < 0) { setErroFormulario("Preencha os campos obrigatórios. A prioridade deve ser um inteiro não negativo."); return; }
    setSalvando(true); setErroFormulario("");
    try {
      const identificadorTronco = regraEditando?.tronco_identifier ?? regraCopiando?.tronco_identifier ?? troncoValue;
      const nomeTronco = regraEditando?.tronco_nome || regraCopiando?.tronco_nome || troncos.find((t) => t.tronco_pjsip === identificadorTronco)?.nome || "";
      const payload = { tenant_id: tenantId, tronco_identifier: identificadorTronco, tronco_nome: nomeTronco, regra_nome: form.regra_nome.trim(), tipo: regraEditando?.tipo ?? regraCopiando?.tipo ?? modelo, tipo_ligacao: form.tipo_ligacao, codigo_csp: form.codigo_csp.trim() || undefined, expressao: form.expressao.trim(), expressao_transformada: form.expressao_transformada.trim(), prioridade: form.prioridade };
      if (regraEditando) await editarRegraFn({ data: { id: regraEditando.id, ...payload } });
      else await criarRegraFn({ data: payload });
      await queryClient.invalidateQueries({ queryKey: ["regras", tenantId] });
      toast.success(regraEditando ? "Regra atualizada" : "Regra criada");
      setDialogAberto(false); setRegraEditando(null); setRegraCopiando(null);
    } catch (error) { setErroFormulario(error instanceof Error ? error.message : "Não foi possível salvar a regra."); }
    finally { setSalvando(false); }
  }
  async function excluirRegra(regra: Regra) {
    if (!tenantId || excluindoId !== null) return;
    setExcluindoId(regra.id);
    try { await excluirRegraFn({ data: { id: regra.id, tenant_id: tenantId } }); await queryClient.invalidateQueries({ queryKey: ["regras", tenantId] }); toast.success("Regra excluída"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir a regra."); }
    finally { setExcluindoId(null); setConfirmarRegra(null); }
  }

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-bold tracking-tight"><RouteIcon className="size-6 text-muted-foreground" /> Regras de roteamento</h1><p className="mt-1 text-sm text-muted-foreground">Consulte, configure e teste as regras de discagem dos troncos.</p></div>
      <Button variant="outline" size="icon" title="Atualizar regras" aria-label="Atualizar regras" onClick={() => void recarregarRegras()} disabled={atualizandoRegras || !tenantId}><RefreshCw className={`size-4 ${atualizandoRegras ? "animate-spin" : ""}`} /></Button>
    </div>
    {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(erro as Error).message || "Não foi possível carregar as regras ou os troncos."}</div>}
    <Card className="shadow-sm"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"><div className="w-full space-y-2 sm:max-w-sm"><Label htmlFor="seletor-tronco">Tronco selecionado</Label><SelectTronco troncos={troncos} troncoValue={troncoValue} carregando={carregandoTroncos} onChange={setTroncoSelecionado} /></div><div className="space-y-2"><Label>Modelo de numeração</Label><Tabs value={modelo} onValueChange={(v) => setModelo(v as Modelo)}><TabsList className="grid w-full grid-cols-2 sm:w-56"><TabsTrigger value="STFC">STFC</TabsTrigger><TabsTrigger value="E164">E164</TabsTrigger></TabsList></Tabs></div></CardContent></Card>
    <div className="grid gap-3 md:grid-cols-3"><StatCard title="Regras cadastradas" value={regrasDoModelo.length} description={`No modelo ${modelo}`} icon={GitBranch} /><StatCard title="Tipos de ligação" value={tiposUsados} description="Categorias configuradas" icon={Layers3} /><StatCard title="Prioridades" value={new Set(regrasDoModelo.map((r) => r.prioridade)).size} description="Níveis de prioridade usados" icon={Hash} /></div>
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="space-y-4 pb-4 p-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div className="space-y-1"><CardTitle className="flex items-center gap-2 text-base sm:text-lg"><GitBranch className="size-4 text-muted-foreground" /> Regras {modelo}<Badge variant="secondary" className="ml-1 font-normal">{regrasDoModelo.length}</Badge></CardTitle><CardDescription>Tronco: {troncoAtual?.nome ?? "Nenhum selecionado"}</CardDescription></div><div className="flex flex-wrap items-center gap-2"><Button onClick={() => abrirNovaRegra(modelo)} disabled={!tenantId || !troncoValue || carregando} size="sm"><Plus className="mr-1.5 size-4" /> Nova regra</Button><Button variant="outline" size="sm" onClick={() => setConfirmarPredefinidas(modelo)} disabled={!tenantId || !troncoValue || carregando || criandoPredefinidas}><GitBranch className="mr-1.5 size-4" /> Predefinidas</Button><Button variant={modoSelecao ? "secondary" : "outline"} size="sm" onClick={() => { setModoSelecao((v) => !v); setSelecionados([]); }}><CheckCheck className="mr-1.5 size-4" /> {modoSelecao ? "Cancelar seleção" : "Selecionar"}</Button><SimuladorRegra troncoIdentifier={troncoValue} modelo={modelo} regras={regrasDoModelo} /></div></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar regra, expressão, CSP..." className="pl-9" /></div>{modoSelecao && <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{selecionados.length} selecionada(s)</span><Button variant="destructive" size="sm" disabled={selecionados.length === 0 || deleteLoteMutation.isPending} onClick={() => setConfirmarExclusao(true)}><Trash2 className="mr-1.5 size-4" /> Excluir selecionadas</Button></div>}</div></CardHeader>
      <CardContent className="pb-5 p-4"><div className="overflow-x-auto rounded-lg border"><Table><TableHeader className="bg-muted/40"><TableRow>{modoSelecao && <TableHead className="w-10"><input type="checkbox" className="size-4 accent-primary" aria-label="Selecionar todas as regras visíveis" checked={todosSelecionados} onChange={(e) => setSelecionados((atual) => e.target.checked ? [...new Set([...atual, ...idsVisiveis])] : atual.filter((id) => !idsVisiveis.includes(id)))} /></TableHead>}<TableHead className="w-20">Prior.</TableHead><TableHead>Regra</TableHead><TableHead>Tipo</TableHead><TableHead>CSP</TableHead><TableHead>Expressão</TableHead><TableHead>Transformação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
        {carregando ? <TableRow><TableCell colSpan={modoSelecao ? 8 : 7} className="h-36 text-center text-sm text-muted-foreground">Carregando regras...</TableCell></TableRow> : regrasVisiveis.length ? regrasVisiveis.map((regra) => <TableRow key={regra.id} className="group hover:bg-muted/30">{modoSelecao && <TableCell><input type="checkbox" className="size-4 accent-primary" aria-label={`Selecionar ${regra.regra_nome}`} checked={selecionados.includes(regra.id)} onChange={(e) => setSelecionados((atual) => e.target.checked ? [...new Set([...atual, regra.id])] : atual.filter((id) => id !== regra.id))} /></TableCell>}<TableCell><Badge variant="secondary" className="font-mono text-xs">{regra.prioridade}</Badge></TableCell><TableCell className="min-w-40 font-medium">{regra.regra_nome}</TableCell><TableCell><Badge variant="outline" className="whitespace-nowrap font-normal">{tipoLigacaoLabel[regra.tipo_ligacao] ?? regra.tipo_ligacao}</Badge></TableCell><TableCell>{regra.codigo_csp ? <span className="font-mono text-xs">{regra.codigo_csp}</span> : <span className="text-muted-foreground">—</span>}</TableCell><TableCell className="min-w-40 max-w-64"><code className="block break-all rounded-md bg-muted/60 px-2 py-1 text-xs">{regra.expressao}</code></TableCell><TableCell className="min-w-40 max-w-64"><code className="block break-all rounded-md bg-muted/60 px-2 py-1 text-xs">{regra.expressao_transformada}</code></TableCell><TableCell><div className="flex justify-end gap-0.5"><IconButton title={`Duplicar ${regra.regra_nome}`} onClick={() => duplicarRegra(regra)}><Copy className="size-4" /></IconButton><IconButton title={`Editar ${regra.regra_nome}`} onClick={() => abrirEdicao(regra)}><Pencil className="size-4" /></IconButton><IconButton title={`Excluir ${regra.regra_nome}`} destructive disabled={excluindoId === regra.id} onClick={() => setConfirmarRegra(regra)}>{excluindoId === regra.id ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</IconButton></div></TableCell></TableRow>) : <TableRow><TableCell colSpan={modoSelecao ? 8 : 7} className="h-44 text-center"><div className="flex flex-col items-center gap-2 text-muted-foreground"><ListFilter className="size-6" /><p className="font-medium text-foreground">{busca ? "Nenhuma regra encontrada na busca" : "Nenhuma regra cadastrada"}</p><p className="text-xs">{busca ? "Tente outro termo." : `Ainda não existem regras ${modelo} para este tronco.`}</p>{!busca && troncoValue && <Button variant="outline" size="sm" className="mt-1" onClick={() => abrirNovaRegra(modelo)}><Plus className="mr-1.5 size-4" /> Criar primeira regra</Button>}</div></TableCell></TableRow>}
      </TableBody></Table></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Exibindo {regrasVisiveis.length} de {regrasDoModelo.length} regras</span><span>Ordenado por prioridade</span></div></CardContent>
    </Card>
    <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir {selecionados.length} {selecionados.length === 1 ? "regra" : "regras"}?</AlertDialogTitle><AlertDialogDescription>As regras selecionadas serão removidas permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteLoteMutation.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleteLoteMutation.isPending} onClick={(e) => { e.preventDefault(); deleteLoteMutation.mutate({ regras_ids: selecionados, tronco_identifier: troncoValue, tipo: modelo }); }}>{deleteLoteMutation.isPending ? "Excluindo..." : "Excluir regras"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!confirmarRegra} onOpenChange={(v) => { if (!v && excluindoId === null) setConfirmarRegra(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir regra?</AlertDialogTitle><AlertDialogDescription>A regra “{confirmarRegra?.regra_nome}” será removida permanentemente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={excluindoId !== null}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={excluindoId !== null} onClick={(e) => { e.preventDefault(); if (confirmarRegra) void excluirRegra(confirmarRegra); }}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={confirmarPredefinidas !== null} onOpenChange={(v) => { if (!v && !criandoPredefinidas) setConfirmarPredefinidas(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Criar regras predefinidas?</AlertDialogTitle><AlertDialogDescription>Serão criadas regras {confirmarPredefinidas} para o tronco “{troncoAtual?.nome ?? troncoValue}”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={criandoPredefinidas}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={criandoPredefinidas} onClick={(e) => { e.preventDefault(); if (confirmarPredefinidas) void criarPredefinidas(confirmarPredefinidas); }}>{criandoPredefinidas ? "Criando..." : "Criar regras"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={dialogAberto} onOpenChange={(v) => { if (!salvando) setDialogAberto(v); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{regraEditando ? "Editar regra" : regraCopiando ? "Duplicar regra" : "Nova regra"}</DialogTitle><DialogDescription>{regraEditando ? "Edite a regra mantendo o tronco associado." : "Configure a regra para o tronco selecionado."}</DialogDescription></DialogHeader><form onSubmit={salvarRegra} className="space-y-4"><div className="rounded-lg border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">Tronco associado</p><p className="mt-1 text-sm font-medium">{troncos.find((t) => t.tronco_pjsip === (regraEditando?.tronco_identifier ?? regraCopiando?.tronco_identifier ?? troncoValue))?.nome ?? regraEditando?.tronco_nome ?? "Nenhum tronco selecionado"}</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="regra-nome">Nome da regra *</Label><Input id="regra-nome" value={form.regra_nome} maxLength={100} onChange={(e) => setForm({ ...form, regra_nome: e.target.value })} required /></div><div className="space-y-1.5"><div className="flex items-center gap-1.5"><Label htmlFor="regra-tipo-ligacao">Tipo de ligação</Label><FieldHelp>Define a classificação da ligação para as permissões do ramal.</FieldHelp></div><Select value={form.tipo_ligacao} onValueChange={(v) => setForm({ ...form, tipo_ligacao: v as Regra["tipo_ligacao"] })}><SelectTrigger id="regra-tipo-ligacao"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="movel">Móvel</SelectItem><SelectItem value="fixo">Fixo</SelectItem><SelectItem value="ddi">DDI</SelectItem><SelectItem value="cng">CNG</SelectItem><SelectItem value="esp">Especial</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><div className="flex items-center gap-1.5"><Label htmlFor="regra-csp">Código CSP</Label><FieldHelp>Código da operadora acrescentado ao início da regra. Ex.: 031.</FieldHelp></div><Input id="regra-csp" value={form.codigo_csp} onChange={(e) => setForm({ ...form, codigo_csp: e.target.value })} placeholder="Opcional" /></div><div className="space-y-1.5"><div className="flex items-center gap-1.5"><Label htmlFor="regra-prioridade">Prioridade *</Label><FieldHelp>Quanto menor o número, maior a prioridade de análise da expressão.</FieldHelp></div><Input id="regra-prioridade" type="number" min={0} step={1} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })} required /></div></div><div className="space-y-1.5"><div className="flex items-center gap-1.5"><Label htmlFor="regra-expressao">Expressão (Regex) *</Label><FieldHelp>Inicie com ^ e finalize com $. Grupos são definidos por parênteses.</FieldHelp></div><Input id="regra-expressao" className="font-mono text-sm" value={form.expressao} onChange={(e) => setForm({ ...form, expressao: e.target.value })} required /></div><div className="space-y-1.5"><div className="flex items-center gap-1.5"><Label htmlFor="regra-transformada">Expressão transformada *</Label><FieldHelp>Use \1 ou \2 para referenciar os grupos capturados. Ex.: 55\1.</FieldHelp></div><Input id="regra-transformada" className="font-mono text-sm" value={form.expressao_transformada} onChange={(e) => setForm({ ...form, expressao_transformada: e.target.value })} required /></div><div className="rounded-lg border bg-muted/25 p-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Variável permitida: </span><code>{"${DDD_AGENTE}"}</code> — preenche o DDD do ramal ao executar a regra.</div>{erroFormulario && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erroFormulario}</div>}<DialogFooter><Button type="button" variant="outline" disabled={salvando} onClick={() => setDialogAberto(false)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : regraEditando ? "Salvar alterações" : "Criar regra"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function SelectTronco({ troncos, troncoValue, carregando, onChange }: { troncos: Tronco[]; troncoValue: string; carregando: boolean; onChange: (value: string) => void }) {
  return <Select value={troncoValue} onValueChange={onChange} disabled={carregando || troncos.length === 0}><SelectTrigger id="seletor-tronco"><Cable className="mr-2 size-4 shrink-0 text-muted-foreground" /><SelectValue placeholder="Selecione um tronco" /></SelectTrigger><SelectContent>{troncos.map((t) => <SelectItem key={t.tronco_pjsip} value={t.tronco_pjsip}>{t.nome}</SelectItem>)}</SelectContent></Select>;
}
