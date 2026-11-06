import { FieldHelp } from "@/components/field-help";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OnlineBadge } from "@/components/online-badge";
import { RecordingBadge } from "@/components/recording-badge";
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  PhoneCall,
  KeyRound,
  Copy,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  listRamais,
  listRamaisStatus,
  createRamal,
  createRamaisLote,
  updateRamal,
  deleteRamal,
  deleteRamaisLote,
  type Ramal,
  generateRamalPassword,
} from "@/lib/ramais.functions";
import { listPesquisaSatisfacao } from "@/lib/pesquisa.functions";
import { listTroncos } from "@/lib/troncos.functions";
import { getSipConfig } from "@/lib/login-config.functions";
import { getClienteByTenant } from "@/lib/clientes.functions";
import { getConfiguracoes } from "@/lib/configuracoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useClienteContext } from "@/context/cliente-context";

export const Route = createFileRoute("/_authenticated/cliente/ramais")({
  head: () => ({ meta: [{ title: "Ramais — Cliente — Painel PABX" }] }),
  component: RamaisPage,
});

const listaDDDs = Array.from({ length: 89 }, (_, i) => String(i + 11));

function RamaisPage() {
  const { tenantId, cliente } = useClienteContext();

  const max = cliente?.quantidade_ramais ?? 0;

  const list = useServerFn(listRamais);
  const statusFn = useServerFn(listRamaisStatus);

  const queryClient = useQueryClient();

  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const deleteLote = useServerFn(deleteRamaisLote);

  const deleteLoteMutation = useMutation({
    mutationFn: (endpoint_ids: string[]) =>
      deleteLote({
        data: {
          tenant_id: tenantId!,
          endpoint_ids,
        },
      }),
    onSuccess: () => {
      toast.success(
        `${selecionados.length} ${
          selecionados.length === 1 ? "ramal removido" : "ramais removidos"
        } com sucesso.`,
      );

      queryClient.invalidateQueries({
        queryKey: ["ramais", tenantId],
      });

      setSelecionados([]);
      setModoSelecao(false);
      setConfirmarExclusao(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ramais", tenantId],
    queryFn: () => list({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });

  const { data: statusData } = useQuery({
    queryKey: ["ramais-status", tenantId],
    queryFn: () => statusFn({ data: { tenant_id: tenantId } }),
    refetchInterval: 5000, // opcional
    enabled: !!tenantId,
  });

  const del = useServerFn(deleteRamal);
  const delMut = useMutation({
    mutationFn: (endpoint_id: string) => del({ data: { endpoint_id, tenant_id: tenantId! } }),
    onSuccess: () => {
      toast.success("Ramal removido");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const count = data?.ramais.length ?? 0;
  const atLimit = max > 0 && count >= max;

  return (
    <div className="space-y-4 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PhoneCall className="h-6 w-6" /> Ramais
          </h1>
          <p className="text-sm text-muted-foreground">
            {count} {max > 0 ? `/ ${max}` : ""} ramais cadastrados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button
            variant={modoSelecao ? "secondary" : "outline"}
            onClick={() => {
              setModoSelecao((v) => !v);
              setSelecionados([]);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {modoSelecao ? "Cancelar seleção" : "Apagar em lote"}
          </Button>
          {modoSelecao && (
            <Button
              variant="destructive"
              disabled={selecionados.length === 0 || deleteLoteMutation.isPending}
              onClick={() => setConfirmarExclusao(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Apagar {selecionados.length || ""} selecionados
            </Button>
          )}
          <NewRamaisLoteDialog tenantId={tenantId} disabled={atLimit} limite={max} cadastrados={count} />
          <NewRamalDialog tenantId={tenantId} disabled={atLimit} />
        </div>
      </div>

      {atLimit && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          Limite de {max} {max === 1 ? "ramal" : "ramais"} atingido para este cliente.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {modoSelecao && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      data?.ramais.length > 0 &&
                      data?.ramais.every((r) => selecionados.includes(r.endpoint_id))
                    }
                    onChange={(e) => {
                      const ids = data?.ramais.map((r) => r.endpoint_id);

                      setSelecionados((atual) =>
                        e.target.checked
                          ? [...new Set([...atual, ...ids])]
                          : atual.filter((id) => !ids.includes(id)),
                      );
                    }}
                  />
                </TableHead>
              )}
              <TableHead>Ramal</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tronco</TableHead>
              <TableHead>DDD</TableHead>
              <TableHead>CallerID</TableHead>
              <TableHead>Sem Permissão Lig/</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gravação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && data?.ramais.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={modoSelecao ? 10 : 9}
                  className="text-center text-muted-foreground py-10"
                >
                  Nenhum ramal cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {data?.ramais.map((r) => (
              <TableRow key={r.endpoint_id}>
                {modoSelecao && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(r.endpoint_id)}
                      onChange={(e) => {
                        setSelecionados((atual) =>
                          e.target.checked
                            ? [...atual, r.endpoint_id]
                            : atual.filter((id) => id !== r.endpoint_id),
                        );
                      }}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono">{r.ramal}</TableCell>
                <TableCell>{r.ramal_nome ? r.ramal_nome.replace(/-/g, " ") : "-"}</TableCell>
                <TableCell>{r.tronco_nome ?? "-"}</TableCell>
                <TableCell>{r.ddd ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{r.callerid ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.fixo && (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        Fixo
                      </Badge>
                    )}
                    {r.movel && (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        Móvel
                      </Badge>
                    )}
                    {r.ddi && (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        DDI
                      </Badge>
                    )}
                    {r.especial && (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        Especial
                      </Badge>
                    )}
                    {r.cng && (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        CNG
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <OnlineBadge state={statusData?.endpoints?.[String(r.ramal)]} showLabel />
                </TableCell>
                <TableCell>
                  <RecordingBadge state={r.gravacao} showLabel />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <RamalNewPassword ramal={r} tenantId={tenantId} />
                    <RamalLoginInfoDialog tenantId={tenantId} ramal={r} />
                    <EditRamalDialog
                      key={`${r.endpoint_id}-${r.senha}-${r.transbordo}-${r.transbordo_tronco}`}
                      tenantId={tenantId}
                      ramal={r}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover ramal {r.ramal}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove o ramal e seu endpoint SIP. Não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(r.endpoint_id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apagar {selecionados.length} {selecionados.length === 1 ? "ramal" : "ramais"}?
            </AlertDialogTitle>

            <AlertDialogDescription>
              Essa ação removerá os ramais selecionados, incluindo seus endpoints SIP e WebRTC. Essa
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>

            <AlertDialogAction
              disabled={deleteLoteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteLoteMutation.mutate(selecionados);
              }}
            >
              {deleteLoteMutation.isPending ? "Apagando..." : "Apagar ramais"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PasswordCell({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs">{shown ? value : "•".repeat(8)}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function ReadOnlyCopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input value={value} readOnly className="font-mono text-sm" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copiado`);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function RamalNewPassword({ ramal, tenantId }: { ramal: Ramal; tenantId?: number }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateRamalPassword);
  const mut = useMutation({
    mutationFn: () =>
      generate({
        data: {
          tenant_id: tenantId!,
          endpoint_id: ramal.endpoint_id,
        },
      }),

    onSuccess: () => {
      toast.success("Nova senha gerada");
      queryClient.invalidateQueries({
        queryKey: ["ramais", tenantId],
      });
    },

    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => mut.mutate()}
      disabled={mut.isPending || !tenantId}
      title="Gerar nova senha"
    >
      <KeyRound className={mut.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
    </Button>
  );
}

function RamalLoginInfoDialog({ ramal }: { ramal: Ramal }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(getSipConfig);
  const { data } = useQuery({
    queryKey: ["sip-config"],
    queryFn: () => fn(),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <UserRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Credenciais do ramal {ramal.ramal}</DialogTitle>
          <DialogDescription>
            Use estes dados para configurar um softphone (Zoiper, Grandstream, etc).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ReadOnlyCopyField label="Usuário (login)" value={ramal.endpoint_id} />
          <ReadOnlyCopyField label="Senha" value={ramal.senha ?? "-"} />
          <ReadOnlyCopyField label="Servidor / Domínio" value={data?.host ?? "carregando…"} />
          <ReadOnlyCopyField label="Porta" value={data?.port ?? "carregando…"} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRamalDialog({ tenantId, disabled }: { tenantId: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const troncosFn = useServerFn(listTroncos);
  const pesquisasFn = useServerFn(listPesquisaSatisfacao);
  const configuracoesFn = useServerFn(getConfiguracoes);

  const { data: configuracoes } = useQuery({
    queryKey: ["configuracoes", tenantId, "modulos.pesquisa_satisfacao"],
    queryFn: () =>
      configuracoesFn({
        data: {
          chaves: ["modulos.pesquisa_satisfacao"],
        },
      }),
    enabled: open && !!tenantId,
  });

  const pesquisaEnabled =
    configuracoes?.some(
      (config) => config.chave === "modulos.pesquisa_satisfacao" && config.valor === "true",
    ) ?? false;

  const { data: troncosData } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => troncosFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const { data: pesquisasData } = useQuery({
    queryKey: ["pesquisas", tenantId],
    queryFn: () => pesquisasFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const emptyForm = {
    nome: "",
    ramal: "",
    tronco: "",
    ddd: "",
    callerid: "",
    fixo: false,
    movel: false,
    ddi: false,
    especial: false,
    cng: false,
    gravacao: false,
    transbordo: false,
    transbordo_troncos: [],
    pesquisa: false,
    pesquisa_id: null as number | null,
  };
  const queryClient = useQueryClient();
  const create = useServerFn(createRamal);
  const [form, setForm] = useState(emptyForm);

  // reset ao abrir
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setForm(emptyForm);
  };

  const troncos = troncosData?.troncos ?? [];
  const pesquisas = pesquisasData?.pesquisas ?? [];
  const troncosDisponiveisTransbordo = troncos.filter((t) => t.tronco_pjsip !== form.tronco);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          ...form,
          tenant_id: tenantId,
          transbordo_tronco:
            form.transbordo && form.transbordo_troncos.length
              ? form.transbordo_troncos.join("&")
              : "",
        },
      }),
    onSuccess: () => {
      toast.success("Ramal criado");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button disabled={disabled}><Plus className="mr-2 h-4 w-4" />Adicionar ramal</Button></DialogTrigger>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 shadow-xl sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
              <PhoneCall className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle className="text-lg">Adicionar ramal</DialogTitle>
              <DialogDescription>Configure um novo ramal e suas permissões de chamada.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{3,6}$/.test(form.ramal)) { toast.error("O ramal deve ter de 3 a 6 dígitos."); return; }
            if (!form.ddd) { toast.error("Selecione o DDD."); return; }
            if (!form.tronco) { toast.error("Selecione um tronco."); return; }
            if (form.pesquisa && !form.pesquisa_id) { toast.error("Selecione uma pesquisa."); return; }
            mut.mutate();
        }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {/* Um único card para todo o conteúdo do formulário */}
            <div className="space-y-6 rounded-xl border border-border/80 bg-muted/10 p-4 shadow-sm sm:p-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Identificação</h3><p className="text-xs text-muted-foreground">Número, nome e identificação das chamadas.</p></div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Ramal *</Label><Input value={form.ramal} onChange={(e) => setForm({ ...form, ramal: e.target.value.replace(/\D/g, "") })} maxLength={6} inputMode="numeric" placeholder="Ex.: 1000" className="h-10 font-mono" /></div>
                <div className="space-y-1.5"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Opcional" className="h-10" /></div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>DDD *</Label><FieldHelp text="Código de área utilizado nas chamadas." /></div>
                  <Select value={form.ddd} onValueChange={(ddd) => setForm({ ...form, ddd })}>
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione o DDD" /></SelectTrigger>
                    <SelectContent>{listaDDDs.map((ddd) => <SelectItem key={ddd} value={ddd}>{ddd}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>CallerID</Label><FieldHelp text="Identificação apresentada ao originar chamadas." /></div>
                  <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value })} maxLength={32} placeholder="Opcional" className="h-10" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Roteamento</h3><p className="text-xs text-muted-foreground">Tronco principal e alternativas de saída.</p></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5"><Label>Tronco principal *</Label><FieldHelp text="Tronco SIP/PJSIP usado para encaminhar chamadas." /></div>
                <Select value={form.tronco} onValueChange={(tronco) => setForm({ ...form, tronco, transbordo_troncos: form.transbordo_troncos.filter((t) => t !== tronco) })}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione um tronco" /></SelectTrigger>
                  <SelectContent>
                    {troncos.map((t) => <SelectItem key={t.tronco_pjsip} value={t.tronco_pjsip}>{t.nome} {t.tipo ? `(${t.tipo})` : ""}</SelectItem>)}
                    {troncos.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum tronco disponível</div>}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-b border-border/60 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-sm font-medium">Transbordo</p><p className="text-xs text-muted-foreground">Usar troncos alternativos quando o principal falhar.</p></div>
                  <Switch checked={form.transbordo} onCheckedChange={(transbordo) => setForm({ ...form, transbordo, transbordo_troncos: transbordo ? form.transbordo_troncos : [] })} />
                </div>
                {form.transbordo && <div className="mt-3 border-t pt-3"><TransbordoTroncosSelector available={troncosDisponiveisTransbordo} selected={form.transbordo_troncos} onChange={(transbordo_troncos) => setForm({ ...form, transbordo_troncos })} /></div>}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Recursos adicionais</h3><p className="text-xs text-muted-foreground">Serviços opcionais deste ramal.</p></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3">
                  <div><p className="text-sm font-medium">Gravação de chamadas</p><p className="text-xs text-muted-foreground">Gravar automaticamente as ligações.</p></div>
                  <Switch checked={form.gravacao} onCheckedChange={(gravacao) => setForm({ ...form, gravacao })} />
                </div>
                {pesquisaEnabled && <div className="border-b border-border/60 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-sm font-medium">Pesquisa de satisfação</p><p className="text-xs text-muted-foreground">Executar pesquisa após a chamada.</p></div>
                    <Switch checked={form.pesquisa} onCheckedChange={(pesquisa) => setForm({ ...form, pesquisa, pesquisa_id: pesquisa ? form.pesquisa_id : null })} />
                  </div>
                  {form.pesquisa && <div className="mt-3 border-t pt-3">
                    <Select value={form.pesquisa_id?.toString() ?? ""} onValueChange={(v) => setForm({ ...form, pesquisa_id: Number(v) })}>
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione uma pesquisa" /></SelectTrigger>
                      <SelectContent>
                        {pesquisas.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome_pesquisa}</SelectItem>)}
                        {pesquisas.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma pesquisa encontrada</div>}
                      </SelectContent>
                    </Select>
                  </div>}
                </div>}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Restrições de chamadas</h3><p className="text-xs text-muted-foreground">Ative os tipos de ligação que deseja bloquear.</p></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["fixo", "Chamadas para fixo"],
                  ["movel", "Chamadas para móvel"],
                  ["ddi", "Chamadas internacionais (DDI)"],
                  ["especial", "Números especiais"],
                  ["cng", "Chamadas CNG"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5">
                    <span className="text-sm">{label}</span>
                    <Switch checked={form[key]} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [key]: checked }))} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Chave ativada = tipo de chamada bloqueado.</p>
            </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t bg-background px-5 py-4 sm:space-x-0 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {mut.isPending ? "Criando..." : "Criar ramal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransbordoTroncosSelector({
  available,
  selected,
  onChange,
}: {
  available: { tronco_pjsip: string; nome: string; tipo: string | null }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const remaining = available.filter((t) => !selected.includes(t.tronco_pjsip));
  const [pick, setPick] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {selected.map((troncoPjsip) => {
          const t = available.find((x) => x.tronco_pjsip === troncoPjsip);
          return (
            <Badge key={troncoPjsip} variant="secondary" className="gap-1 whitespace-nowrap">
              {t?.nome ?? `#${troncoPjsip}`}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => onChange(selected.filter((x) => x !== troncoPjsip))}
              >
                ×
              </button>
            </Badge>
          );
        })}
        {selected.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Nenhum tronco de transbordo selecionado
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={remaining.length ? "Selecione tronco…" : "Nenhum disponível"}
            />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((t) => (
              <SelectItem key={t.tronco_pjsip} value={t.tronco_pjsip}>
                {t.nome} {t.tipo ? `(${t.tipo})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!pick}
          onClick={() => {
            onChange([...selected, pick]);
            setPick("");
          }}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function EditRamalDialog({ tenantId, ramal }: { tenantId: number; ramal: Ramal }) {
  const [open, setOpen] = useState(false);
  const troncosFn = useServerFn(listTroncos);
  const pesquisasFn = useServerFn(listPesquisaSatisfacao);

  const configuracoesFn = useServerFn(getConfiguracoes);

  const { data: configuracoes } = useQuery({
    queryKey: ["configuracoes", tenantId, "modulos.pesquisa_satisfacao"],
    queryFn: () =>
      configuracoesFn({
        data: {
          chaves: ["modulos.pesquisa_satisfacao"],
        },
      }),
    enabled: open && !!tenantId,
  });

  const pesquisaEnabled =
    configuracoes?.some(
      (config) => config.chave === "modulos.pesquisa_satisfacao" && config.valor === "true",
    ) ?? false;

  const { data: troncosData } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => troncosFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const { data: pesquisasData } = useQuery({
    queryKey: ["pesquisas", tenantId],
    queryFn: () => pesquisasFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const initial = () => ({
    nome: ramal.ramal_nome ?? "",
    tronco: ramal.tronco != null ? String(ramal.tronco) : "",
    ddd: ramal.ddd ?? "",
    callerid: ramal.callerid ?? "",
    fixo: ramal.fixo,
    movel: ramal.movel,
    ddi: ramal.ddi,
    especial: ramal.especial,
    cng: ramal.cng,
    gravacao: ramal.gravacao,
    transbordo: ramal.transbordo,
    transbordo_troncos: ramal.transbordo_tronco
      ? ramal.transbordo_tronco.split("&").filter(Boolean)
      : [],
    pesquisa: ramal.pesquisa,
    pesquisa_id: ramal.pesquisa_id,
  });
  const [form, setForm] = useState(initial);

  // Sempre que o dialog abrir, reseta para os valores do banco (evita cache "sujo")
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setForm(initial());
  };

  const troncos = troncosData?.troncos ?? [];
  const pesquisas = pesquisasData?.pesquisas ?? [];
  const troncosDisponiveisTransbordo = troncos.filter((t) => t.tronco_pjsip !== form.tronco);

  const queryClient = useQueryClient();
  const update = useServerFn(updateRamal);
  const mut = useMutation({
    mutationFn: () =>
      update({
        data: {
          endpoint_id: ramal.endpoint_id,
          tenant_id: tenantId,
          nome: form.nome,
          tronco: form.tronco,
          ddd: form.ddd,
          callerid: form.callerid,
          fixo: form.fixo,
          movel: form.movel,
          ddi: form.ddi,
          especial: form.especial,
          cng: form.cng,
          gravacao: form.gravacao,
          transbordo: form.transbordo,
          transbordo_tronco: form.transbordo ? form.transbordo_troncos.join("&") : "",
          pesquisa: form.pesquisa,
          pesquisa_id: form.pesquisa ? form.pesquisa_id : null,
        },
      }),
    onSuccess: () => {
      toast.success("Ramal atualizado");
      queryClient.invalidateQueries({ queryKey: ["ramais", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" title="Editar ramal"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 shadow-xl sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
              <PhoneCall className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle className="text-lg">Editar ramal {ramal.ramal}</DialogTitle>
              <DialogDescription>Atualize as configurações e permissões deste ramal.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!form.tronco) { toast.error("Selecione um tronco."); return; }
            if (form.pesquisa && !form.pesquisa_id) { toast.error("Selecione uma pesquisa."); return; }
            mut.mutate();
        }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {/* Um único card para todo o conteúdo do formulário */}
            <div className="space-y-6 rounded-xl border border-border/80 bg-muted/10 p-4 shadow-sm sm:p-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Identificação</h3><p className="text-xs text-muted-foreground">Número, nome e identificação das chamadas.</p></div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Número do ramal</Label><Input value={ramal.ramal} disabled className="h-10 font-mono" /></div>
                <div className="space-y-1.5"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Opcional" className="h-10" /></div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>DDD </Label><FieldHelp text="Código de área utilizado nas chamadas." /></div>
                  <Select value={form.ddd} onValueChange={(ddd) => setForm({ ...form, ddd })}>
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione o DDD" /></SelectTrigger>
                    <SelectContent>{listaDDDs.map((ddd) => <SelectItem key={ddd} value={ddd}>{ddd}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>CallerID</Label><FieldHelp text="Identificação apresentada ao originar chamadas." /></div>
                  <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value })} maxLength={32} placeholder="Opcional" className="h-10" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Roteamento</h3><p className="text-xs text-muted-foreground">Tronco principal e alternativas de saída.</p></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5"><Label>Tronco principal *</Label><FieldHelp text="Tronco SIP/PJSIP usado para encaminhar chamadas." /></div>
                <Select value={form.tronco} onValueChange={(tronco) => setForm({ ...form, tronco, transbordo_troncos: form.transbordo_troncos.filter((t) => t !== tronco) })}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione um tronco" /></SelectTrigger>
                  <SelectContent>
                    {troncos.map((t) => <SelectItem key={t.tronco_pjsip} value={t.tronco_pjsip}>{t.nome} {t.tipo ? `(${t.tipo})` : ""}</SelectItem>)}
                    {troncos.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum tronco disponível</div>}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-b border-border/60 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-sm font-medium">Transbordo</p><p className="text-xs text-muted-foreground">Usar troncos alternativos quando o principal falhar.</p></div>
                  <Switch checked={form.transbordo} onCheckedChange={(transbordo) => setForm({ ...form, transbordo, transbordo_troncos: transbordo ? form.transbordo_troncos : [] })} />
                </div>
                {form.transbordo && <div className="mt-3 border-t pt-3"><TransbordoTroncosSelector available={troncosDisponiveisTransbordo} selected={form.transbordo_troncos} onChange={(transbordo_troncos) => setForm({ ...form, transbordo_troncos })} /></div>}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Recursos adicionais</h3><p className="text-xs text-muted-foreground">Serviços opcionais deste ramal.</p></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3">
                  <div><p className="text-sm font-medium">Gravação de chamadas</p><p className="text-xs text-muted-foreground">Gravar automaticamente as ligações.</p></div>
                  <Switch checked={form.gravacao} onCheckedChange={(gravacao) => setForm({ ...form, gravacao })} />
                </div>
                {pesquisaEnabled && <div className="border-b border-border/60 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-sm font-medium">Pesquisa de satisfação</p><p className="text-xs text-muted-foreground">Executar pesquisa após a chamada.</p></div>
                    <Switch checked={form.pesquisa} onCheckedChange={(pesquisa) => setForm({ ...form, pesquisa, pesquisa_id: pesquisa ? form.pesquisa_id : null })} />
                  </div>
                  {form.pesquisa && <div className="mt-3 border-t pt-3">
                    <Select value={form.pesquisa_id?.toString() ?? ""} onValueChange={(v) => setForm({ ...form, pesquisa_id: Number(v) })}>
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione uma pesquisa" /></SelectTrigger>
                      <SelectContent>
                        {pesquisas.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome_pesquisa}</SelectItem>)}
                        {pesquisas.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma pesquisa encontrada</div>}
                      </SelectContent>
                    </Select>
                  </div>}
                </div>}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div><h3 className="text-sm font-semibold">Restrições de chamadas</h3><p className="text-xs text-muted-foreground">Ative os tipos de ligação que deseja bloquear.</p></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["fixo", "Chamadas para fixo"],
                  ["movel", "Chamadas para móvel"],
                  ["ddi", "Chamadas internacionais (DDI)"],
                  ["especial", "Números especiais"],
                  ["cng", "Chamadas CNG"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5">
                    <span className="text-sm">{label}</span>
                    <Switch checked={form[key]} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [key]: checked }))} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Chave ativada = tipo de chamada bloqueado.</p>
            </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t bg-background px-5 py-4 sm:space-x-0 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              <Pencil className="mr-2 h-4 w-4" />
              {mut.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewRamaisLoteDialog({ tenantId, disabled, limite, cadastrados }: { tenantId: number; disabled?: boolean, limite: number; cadastrados: number; }) {
  const [open, setOpen] = useState(false);

  const troncosFn = useServerFn(listTroncos);
  const pesquisasFn = useServerFn(listPesquisaSatisfacao);

  const configuracoesFn = useServerFn(getConfiguracoes);

  const { data: configuracoes } = useQuery({
    queryKey: ["configuracoes", tenantId, "modulos.pesquisa_satisfacao"],
    queryFn: () =>
      configuracoesFn({
        data: {
          chaves: ["modulos.pesquisa_satisfacao"],
        },
      }),
    enabled: open && !!tenantId,
  });

  const pesquisaEnabled =
    configuracoes?.some(
      (config) => config.chave === "modulos.pesquisa_satisfacao" && config.valor === "true",
    ) ?? false;

  const { data: troncosData } = useQuery({
    queryKey: ["troncos", tenantId],
    queryFn: () => troncosFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const { data: pesquisasData } = useQuery({
    queryKey: ["pesquisas", tenantId],
    queryFn: () => pesquisasFn({ data: { tenant_id: tenantId } }),
    enabled: open && !!tenantId,
  });

  const [form, setForm] = useState({
    ramal_inicial: "",
    quantidade: "",

    ddd: "",
    tronco: "",
    callerid: "",

    fixo: false,
    movel: false,
    ddi: false,
    especial: false,
    cng: false,

    gravacao: false,

    transbordo: false,
    transbordo_troncos: [] as string[],

    pesquisa: false,
    pesquisa_id: null as number | null,
  });

  const troncos = troncosData?.troncos ?? [];
  const pesquisas = pesquisasData?.pesquisas ?? [];

  const troncosDisponiveisTransbordo = troncos.filter((t) => t.tronco_pjsip !== form.tronco);

  const ramalInicial = Number(form.ramal_inicial);
  const quantidade = Number(form.quantidade);

  const limiteAtivo = limite > 0;
  const disponiveis = limiteAtivo
    ? Math.max(0, limite - cadastrados)
    : 1000;

  const excedeLimite =
    limiteAtivo &&
    quantidade > disponiveis;

  const faixaValida =
    Number.isInteger(ramalInicial) &&
    ramalInicial >= 0 &&
    Number.isInteger(quantidade) &&
    quantidade > 0;

  const ultimoRamal = faixaValida ? ramalInicial + quantidade - 1 : null;

  const resetForm = () => {
    setForm({
      ramal_inicial: "",
      quantidade: "",

      ddd: "",
      tronco: "",
      callerid: "",

      fixo: false,
      movel: false,
      ddi: false,
      especial: false,
      cng: false,

      gravacao: false,

      transbordo: false,
      transbordo_troncos: [],

      pesquisa: false,
      pesquisa_id: null,
    });
  };

  const createLoteFn = useServerFn(createRamaisLote);
  const queryClient = useQueryClient();

  const createLoteMutation = useMutation({
    mutationFn: (data: Parameters<typeof createLoteFn>[0]["data"]) => createLoteFn({ data }),

    onSuccess: () => {
      toast.success(
        `${quantidade} ${quantidade === 1 ? "ramal criado" : "ramais criados"} com sucesso.`,
      );

      queryClient.invalidateQueries({
        queryKey: ["ramais", tenantId],
      });

      setOpen(false);
      resetForm();
    },

    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível criar os ramais em lote.",
      );
    },
  });

  const handleOpenChange = (value: boolean) => {
    setOpen(value);

    if (value) {
      resetForm();
    }
  };

  const validar = () => {
    if (!form.ramal_inicial) {
      toast.error("Atenção: insira o número inicial do ramal.");
      return false;
    }

    if (!form.quantidade || Number(form.quantidade) <= 0) {
      toast.error("Atenção: informe uma quantidade válida de ramais.");
      return false;
    }

    if (!Number.isInteger(quantidade) || quantidade > 1000) {
      toast.error("A quantidade deve estar entre 1 e 1000 ramais.");
      return false;
    }

    if (excedeLimite) {
      toast.error(
        `Limite excedido! Este cliente possui apenas ${disponiveis} ` +
        `${disponiveis === 1 ? "ramal disponível" : "ramais disponíveis"}.`
      );
      return false;
    }

    if (!form.ddd) {
      toast.error("Atenção: insira o DDD dos ramais.");
      return false;
    }

    if (!form.tronco) {
      toast.error("Atenção: insira um tronco.");
      return false;
    }

    if (form.pesquisa && !form.pesquisa_id) {
      toast.error("Atenção: selecione uma pesquisa de satisfação.");
      return false;
    }

    return true;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validar()) return;

    createLoteMutation.mutate({
      tenant_id: tenantId,
      ramal_inicial: form.ramal_inicial,
      quantidade: Number(form.quantidade),

      ddd: form.ddd,
      tronco: form.tronco,
      callerid: form.callerid,

      fixo: form.fixo,
      movel: form.movel,
      ddi: form.ddi,
      especial: form.especial,
      cng: form.cng,

      gravacao: form.gravacao,

      transbordo: form.transbordo,
      transbordo_tronco: form.transbordo_troncos.join(","),

      pesquisa: form.pesquisa,
      pesquisa_id: form.pesquisa ? form.pesquisa_id : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <UsersRound className="mr-2 h-4 w-4" />
          Adicionar em lote
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 shadow-xl sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
              <UsersRound className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle className="text-lg">Adicionar ramais em lote</DialogTitle>
              <DialogDescription>
                Configure a faixa e as opções que serão aplicadas a todos os ramais.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {/* Um único card para todo o conteúdo do formulário */}
            <div className="space-y-6 rounded-xl border border-border/80 bg-muted/10 p-4 shadow-sm sm:p-5">

            {/* Resumo da capacidade */}
            <div className="grid grid-cols-3 gap-2 border-b border-border/60 pb-5 sm:gap-3">
              <div className="min-w-0 px-2 py-2 text-center sm:px-3">
                <p className="text-[11px] text-muted-foreground">Cadastrados</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{cadastrados}</p>
              </div>
              <div className="min-w-0 px-2 py-2 text-center sm:px-3">
                <p className="text-[11px] text-muted-foreground">Limite</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {limiteAtivo ? limite : "—"}
                </p>
              </div>
              <div className="min-w-0 px-2 py-2 text-center sm:px-3">
                <p className="text-[11px] text-muted-foreground">Disponíveis</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {limiteAtivo ? disponiveis : "Sem limite"}
                </p>
              </div>
              {limiteAtivo && (
                <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (cadastrados / limite) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Seção 1 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold">Faixa de ramais</h3>
                  <p className="text-xs text-muted-foreground">
                    Defina o primeiro número e a quantidade de ramais.
                  </p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Número inicial *</Label>
                    <FieldHelp text="Número do primeiro ramal a ser criado (3 a 6 dígitos)." />
                  </div>
                  <Input
                    value={form.ramal_inicial}
                    onChange={(e) =>
                      setForm({ ...form, ramal_inicial: e.target.value.replace(/\D/g, "") })
                    }
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="Ex.: 1000"
                    className="h-10 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Quantidade *</Label>
                    <FieldHelp text="Quantidade de ramais a criar. Máximo de 1000 por operação e limitado à cota disponível." />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={Math.min(1000, disponiveis)}
                    value={form.quantidade}
                    onChange={(e) =>
                      setForm({ ...form, quantidade: e.target.value.replace(/\D/g, "") })
                    }
                    placeholder="Ex.: 10"
                    className="h-10"
                  />
                </div>
              </div>
              {excedeLimite && (
                <p className="text-xs font-medium text-destructive">
                  Quantidade acima da cota: apenas {disponiveis} ramais disponíveis.
                </p>
              )}
              {faixaValida && ultimoRamal !== null && (
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                  excedeLimite || ultimoRamal > 999999 ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"
                }`}>
                  <div>
                    <p className="text-xs text-muted-foreground">Prévia da numeração</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {form.ramal_inicial} <span className="px-2 text-muted-foreground">até</span> {ultimoRamal}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {quantidade} {quantidade === 1 ? "ramal" : "ramais"}
                  </Badge>
                </div>
              )}
            </section>

            {/* Seção 2 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold">Configuração de telefonia</h3>
                  <p className="text-xs text-muted-foreground">
                    Roteamento e identificação de chamadas.
                  </p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>DDD *</Label>
                    <FieldHelp text="Código de área utilizado pelos ramais." />
                  </div>
                  <Select value={form.ddd} onValueChange={(ddd) => setForm({ ...form, ddd })}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Selecione o DDD" />
                    </SelectTrigger>
                    <SelectContent>
                      {listaDDDs.map((ddd) => (
                        <SelectItem key={ddd} value={ddd}>{ddd}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>CallerID</Label>
                    <FieldHelp text="Identificação apresentada nas chamadas originadas." />
                  </div>
                  <Input
                    className="h-10"
                    value={form.callerid}
                    onChange={(e) => setForm({ ...form, callerid: e.target.value })}
                    maxLength={32}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Tronco principal *</Label>
                    <FieldHelp text="Tronco SIP/PJSIP responsável pelo encaminhamento das chamadas." />
                  </div>
                  <Select
                    value={form.tronco}
                    onValueChange={(tronco) =>
                      setForm({
                        ...form,
                        tronco,
                        transbordo_troncos: form.transbordo_troncos.filter((item) => item !== tronco),
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Selecione um tronco" />
                    </SelectTrigger>
                    <SelectContent>
                      {troncos.map((t) => (
                        <SelectItem key={t.tronco_pjsip} value={t.tronco_pjsip}>
                          {t.nome} {t.tipo ? `(${t.tipo})` : ""}
                        </SelectItem>
                      ))}
                      {troncos.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Nenhum tronco encontrado
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Seção 3 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold">Recursos adicionais</h3>
                  <p className="text-xs text-muted-foreground">
                    Ative os recursos opcionais para todos os novos ramais.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="border-b border-border/60 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Gravação de chamadas</p>
                      <p className="text-xs text-muted-foreground">
                        Gravar automaticamente as chamadas dos novos ramais.
                      </p>
                    </div>
                    <Switch
                      checked={form.gravacao}
                      onCheckedChange={(gravacao) => setForm({ ...form, gravacao })}
                    />
                  </div>
                </div>
                <div className="border-b border-border/60 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Transbordo</p>
                      <p className="text-xs text-muted-foreground">
                        Encaminhar chamadas por outros troncos quando necessário.
                      </p>
                    </div>
                    <Switch
                      checked={form.transbordo}
                      onCheckedChange={(transbordo) =>
                        setForm({
                          ...form,
                          transbordo,
                          transbordo_troncos: transbordo ? form.transbordo_troncos : [],
                        })
                      }
                    />
                  </div>
                  {form.transbordo && (
                    <div className="mt-3 border-t pt-3">
                      <TransbordoTroncosSelector
                        available={troncosDisponiveisTransbordo}
                        selected={form.transbordo_troncos}
                        onChange={(transbordo_troncos) =>
                          setForm({ ...form, transbordo_troncos })
                        }
                      />
                    </div>
                  )}
                </div>
                {pesquisaEnabled && (
                  <div className="border-b border-border/60 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Pesquisa de satisfação</p>
                        <p className="text-xs text-muted-foreground">
                          Executar pesquisa ao finalizar a chamada.
                        </p>
                      </div>
                      <Switch
                        checked={form.pesquisa}
                        onCheckedChange={(pesquisa) =>
                          setForm({
                            ...form,
                            pesquisa,
                            pesquisa_id: pesquisa ? form.pesquisa_id : null,
                          })
                        }
                      />
                    </div>
                    {form.pesquisa && (
                      <div className="mt-3 border-t pt-3">
                        <Select
                          value={form.pesquisa_id?.toString() ?? ""}
                          onValueChange={(value) =>
                            setForm({ ...form, pesquisa_id: Number(value) })
                          }
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="Selecione uma pesquisa" />
                          </SelectTrigger>
                          <SelectContent>
                            {pesquisas.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.nome_pesquisa}
                              </SelectItem>
                            ))}
                            {pesquisas.length === 0 && (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Nenhuma pesquisa encontrada
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Seção 4 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold">Restrições de chamadas</h3>
                  <p className="text-xs text-muted-foreground">
                    Ative apenas os tipos de ligação que deseja bloquear.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["fixo", "Chamadas para fixo"],
                  ["movel", "Chamadas para móvel"],
                  ["ddi", "Chamadas internacionais (DDI)"],
                  ["especial", "Números especiais"],
                  ["cng", "Chamadas CNG"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Chave ativada = tipo de chamada bloqueado.
              </p>
            </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t bg-background px-5 py-4 sm:space-x-0 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                createLoteMutation.isPending ||
                !faixaValida ||
                form.ramal_inicial.length < 3 ||
                ultimoRamal === null ||
                ultimoRamal > 999999 ||
                !form.ddd ||
                !form.tronco ||
                (form.pesquisa && !form.pesquisa_id) ||
                excedeLimite ||
                quantidade > 1000
              }
            >
              <UsersRound className="mr-2 h-4 w-4" />
              {createLoteMutation.isPending
                ? "Criando..."
                : `Criar ${faixaValida ? quantidade : ""} ${quantidade === 1 ? "ramal" : "ramais"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
