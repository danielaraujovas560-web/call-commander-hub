import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listRamais } from "@/lib/ramais.functions";
import { listarCatalogoConferencias, alterarMuteConfbridge } from "@/lib/confbridge-controle.functions";
import {
  ChevronDown, ChevronUp, Mic, MicOff, Radio, Users, WifiOff,
  MessageSquareText, UserRound, Activity, Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useConfbridgeMonitor, type ConferenciaAoVivo, type ParticipanteConferencia } from "@/hooks/use-confbridge-monitor";

type Props = { tenantId?: number };
type Identidade = { nome: string; ramal: string };

// O dispositivo web/mobile e o ramal físico pertencem à mesma identidade lógica.
// Ex.: PJSIP/19999-web-00000347 -> 19999 -> ramal 9999 (tenant 1).
function endpointDoCanal(canal: string) {
  const match = String(canal || "").match(/^PJSIP\/(.+)-[0-9a-f]{8,16}$/i);
  return match?.[1] ?? "";
}

function ramalLogico(endpoint: string) {
  return String(endpoint || "").trim().replace(/-(web|mobile)$/i, "");
}

function somenteRamal(endpoint: string, tenantId?: number) {
  const base = ramalLogico(endpoint);
  const prefixo = tenantId && Number.isSafeInteger(Number(tenantId)) ? String(tenantId) : "";
  return /^\d+$/.test(base) && prefixo && base.startsWith(prefixo)
    ? base.slice(prefixo.length)
    : base;
}

function nomeLimpo(nome: string, endpoint: string, ramal: string) {
  const valor = String(nome || "").trim();
  const base = ramalLogico(endpoint);
  if (!valor || /^<?unknown>?$/i.test(valor)) return "";
  if ([base, `${base}-web`, `${base}-mobile`, ramal].some(v => v && valor.toLowerCase() === v.toLowerCase())) return "";
  // Bancos antigos podem ter nome com o endpoint no começo: "11234 Teste Daniel".
  return valor.replace(new RegExp(`^${base}\\s+`, "i"), "").trim();
}

function identidadeParticipante(p: ParticipanteConferencia, porEndpoint: Record<string, Identidade>, tenantId?: number): Identidade {
  const endpoint = endpointDoCanal(p.canal);
  const base = ramalLogico(endpoint);
  const numeroAmi = ramalLogico(String(p.numero || "").trim());
  // A pesquisa pelo endpoint lógico tem prioridade absoluta sobre o CallerID.
  const cadastro = porEndpoint[base] || porEndpoint[numeroAmi];
  if (cadastro) return cadastro;

  const ramal = somenteRamal(base || numeroAmi, tenantId);
  // Sem correspondência no cadastro, não exibimos nome ou endpoint técnico do AMI.
  return { nome: ramal ? `Ramal ${ramal}` : "Participante", ramal: ramal || "Não identificado" };
}

function Sala({
  sala, nome, ramal, porEndpoint, tenantId, onMute, canalPendente,
}: {
  sala: ConferenciaAoVivo;
  nome?: string;
  ramal?: string | null;
  porEndpoint: Record<string, Identidade>;
  tenantId?: number;
  onMute: (s: ConferenciaAoVivo, p: ParticipanteConferencia) => void;
  canalPendente?: string;
}) {
  const [expandida, setExpandida] = useState(true);
  const falando = sala.participantes.filter(p => p.falando).length;
  const mutados = sala.participantes.filter(p => p.mutado).length;
  const titulo = nome?.trim() || (sala.tipo === "CHAMADA" ? "Conferência temporária" : `Conferência ${sala.conferenciaId}`);
  const descricao = ramal ? `Ramal ${ramal}` : sala.tipo === "CHAMADA" ? "Conferência de chamada" : "Conferência interna";

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight">{titulo}</h3>
              <Badge variant="secondary" className="font-normal">{sala.tipo === "CHAMADA" ? "Temporária" : "Interna"}</Badge>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Em andamento
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpandida(v => !v)}
          aria-expanded={expandida}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
        >
          <Users className="h-4 w-4" />
          {sala.participantes.length} {sala.participantes.length === 1 ? "participante" : "participantes"}
          {expandida ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expandida && (
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" />{falando ? `${falando} falando agora` : "Nenhum participante falando"}</span>
            <span className="inline-flex items-center gap-1.5"><MicOff className="h-3.5 w-3.5" />{mutados} {mutados === 1 ? "microfone mutado" : "microfones mutados"}</span>
          </div>

          {sala.participantes.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Sala iniciada, aguardando participantes.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {sala.participantes.map(p => {
                const pessoa = identidadeParticipante(p, porEndpoint, tenantId);
                return (
                  <div key={p.canal} className={`flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${p.falando ? "border-emerald-500/40 bg-emerald-500/5" : "bg-background"}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${p.falando ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" title={pessoa.nome}>{pessoa.nome}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {pessoa.ramal === "Não identificado" ? pessoa.ramal : `Ramal ${pessoa.ramal}`}</p>
                    </div>
                    {p.falando && <span className="hidden items-center gap-1 text-xs font-medium text-emerald-600 sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Falando</span>}
                    <button
                      type="button"
                      disabled={canalPendente === p.canal}
                      onClick={() => onMute(sala, p)}
                      title={p.mutado ? "Desmutar no ConfBridge" : "Mutar no ConfBridge"}
                      aria-label={p.mutado ? `Desmutar ${pessoa.nome}` : `Mutar ${pessoa.nome}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-wait disabled:opacity-50 ${p.mutado ? "border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500/15" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      {p.mutado ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function MonitoramentoConferencias({ tenantId }: Props) {
  const { conferencias, conectado, sincronizado, erro, totalParticipantes } = useConfbridgeMonitor(tenantId);
  const catalogoFn = useServerFn(listarCatalogoConferencias);
  const ramaisFn = useServerFn(listRamais);
  const muteFn = useServerFn(alterarMuteConfbridge);
  const [canalPendente, setCanalPendente] = useState<string | undefined>();

  const { data: catalogo } = useQuery({
    queryKey: ["confbridge-catalogo", tenantId],
    queryFn: () => catalogoFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId, staleTime: 30000,
  });
  const { data: dadosRamais } = useQuery({
    queryKey: ["ramais-confbridge-nomes", tenantId],
    queryFn: () => ramaisFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId, staleTime: 60000,
  });

  const porEndpoint = useMemo(() => {
    const mapa: Record<string, Identidade> = {};
    for (const r of dadosRamais?.ramais ?? []) {
      const endpoint = ramalLogico(String(r.endpoint_id ?? ""));
      const ramal = String(r.ramal ?? "").trim();
      if (!endpoint) continue;
      // GET /ramais devolve r.nome AS ramal_nome, e não necessariamente r.nome.
      const nomeBruto = String(r.ramal_nome ?? r.nome ?? "").trim();
      const nome = nomeLimpo(nomeBruto, endpoint, ramal);
      mapa[endpoint] = {
        nome: nome || (ramal ? `Ramal ${ramal}` : "Participante"),
        ramal: ramal || "Não identificado",
      };
    }
    return mapa;
  }, [dadosRamais]);

  const catalogoPorSala = useMemo(() => {
    const mapa = new Map<string, { nome: string; ramal: string | null }>();
    for (const c of catalogo?.conferencias ?? []) mapa.set(`${c.tipo}:${c.id}`, { nome: c.nome, ramal: c.ramal });
    return mapa;
  }, [catalogo]);

  const muteMutation = useMutation({
    mutationFn: async ({ sala, participante }: { sala: ConferenciaAoVivo; participante: ParticipanteConferencia }) => {
      setCanalPendente(participante.canal);
      return muteFn({ data: { tenant_id: tenantId, id: sala.conferenciaId, tipo: sala.tipo, canal: participante.canal, mutado: !participante.mutado } });
    },
    onSuccess: () => toast.success("Comando enviado ao ConfBridge"),
    onError: (e: Error) => toast.error(e.message || "Falha ao alterar microfone"),
    onSettled: () => setCanalPendente(undefined),
  });

  const internas = conferencias.filter(s => s.tipo === "INTERNA").length;
  const temporarias = conferencias.filter(s => s.tipo === "CHAMADA").length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Monitoramento de Conferências</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe as salas e seus participantes em tempo real.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${conectado && sincronizado ? "bg-emerald-500" : "bg-amber-500"}`} />
          {conectado && sincronizado ? "Monitoramento ativo" : "Reconectando…"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><MessageSquareText className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Salas em andamento</p><p className="text-2xl font-semibold tabular-nums">{conferencias.length}</p></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Users className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Participantes conectados</p><p className="text-2xl font-semibold tabular-nums">{totalParticipantes}</p></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Activity className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Internas / Temporárias</p><p className="text-2xl font-semibold tabular-nums">{internas} <span className="font-normal text-muted-foreground">/</span> {temporarias}</p></div></CardContent></Card>
      </div>

      {erro && !conectado && <p className="rounded-lg border border-amber-500/30 p-3 text-sm text-muted-foreground">{erro}</p>}
      {!sincronizado && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><WifiOff className="h-4 w-4" /> Aguardando sincronização com o monitoramento…</div>}
      {sincronizado && conferencias.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma conferência em andamento.</CardContent></Card>}
      {sincronizado && conferencias.length > 0 && (
        <div className="space-y-4">
          {conferencias.map(s => {
            const cadastro = catalogoPorSala.get(`${s.tipo}:${s.conferenciaId}`);
            return <Sala key={s.sala} sala={s} nome={cadastro?.nome} ramal={cadastro?.ramal} porEndpoint={porEndpoint} tenantId={tenantId} canalPendente={canalPendente} onMute={(sala, participante) => muteMutation.mutate({ sala, participante })} />;
          })}
        </div>
      )}
    </section>
  );
}
