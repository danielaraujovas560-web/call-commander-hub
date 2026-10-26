import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { useClienteContext } from "./_cliente-context";
import { useIsAdmin } from "@/hooks/use-role";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  listIntegracoes,
  getIntegracaoTemplate,
  createIntegracao,
  updateIntegracao,
  deleteIntegracao,
  type IntegracoesItem,
} from "@/lib/integracoes.functions";

export const Route = createFileRoute("/_authenticated/cliente/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Cliente — Painel PABX" }] }),
  component: ClienteIntegracoes,
});

type IntegracaoComWaba = IntegracoesItem & { waba_id?: string | null };

type FormState = {
  provider: "meta";
  remetente: string;
  waba_id: string;
  template_nome: string;
  template_idioma: string;
  nome_empresa: string;
  ativo: boolean;
  access_token: string;
};

const initialForm = (): FormState => ({
  provider: "meta",
  remetente: "",
  waba_id: "",
  template_nome: "chamada_perdida_retorno",
  template_idioma: "pt_BR",
  nome_empresa: "",
  ativo: true,
  access_token: "",
});

function formFromItem(item: IntegracaoComWaba): FormState {
  return {
    provider: "meta",
    remetente: String(item.remetente ?? ""),
    waba_id: String(item.waba_id ?? ""),
    template_nome: item.template_nome ?? "",
    template_idioma: item.template_idioma ?? "pt_BR",
    nome_empresa: item.nome_empresa ?? "",
    ativo: Boolean(item.ativo),
    access_token: "", // Nunca carregar o token antigo no navegador.
  };
}

function FieldHelp({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Ajuda sobre o campo"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ItemDialog({
  open,
  onOpenChange,
  item,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  item: IntegracaoComWaba | null;
  tenantId: number;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createIntegracao);
  const updateFn = useServerFn(updateIntegracao);
  const [form, setForm] = useState<FormState>(initialForm);
  const editing = item !== null;

  useEffect(() => {
    if (open) setForm(item ? formFromItem(item) : initialForm());
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: () =>
      item
        ? updateFn({ data: { ...form, id: item.id, tenant_id: tenantId } })
        : createFn({ data: { ...form, tenant_id: tenantId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["integracoes", tenantId] });
      toast.success(editing ? "Integração atualizada" : "Integração criada");
      onOpenChange(false);
      setForm(initialForm());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const valid =
    /^\d{5,30}$/.test(form.remetente) &&
    /^\d{5,32}$/.test(form.waba_id) &&
    form.nome_empresa.trim().length > 0 &&
    form.nome_empresa.trim().length <= 150 &&
    /^[a-zA-Z0-9_]{1,255}$/.test(form.template_nome) &&
    /^[a-z]{2}_[A-Z]{2}$/.test(form.template_idioma) &&
    (editing || form.access_token.trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!mutation.isPending) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar integração" : "Nova integração WhatsApp"}</DialogTitle>
          <DialogDescription>
            Configure a Meta Cloud API. O token não será exibido após salvar.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-empresa">Nome da empresa *</Label>
              <FieldHelp text="Nome exibido no painel e utilizado como variável da mensagem de retorno." />
            </div>
            <Input
              id="integracao-empresa"
              value={form.nome_empresa}
              onChange={(event) => update("nome_empresa", event.target.value)}
              maxLength={150}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-remetente">Phone Number ID (Meta) *</Label>
              <FieldHelp text="Identificador do número de envio na Meta Cloud API. Não é o número de telefone." />
            </div>
            <Input
              id="integracao-remetente"
              inputMode="numeric"
              value={form.remetente}
              onChange={(event) => update("remetente", event.target.value.replace(/\D/g, ""))}
              placeholder="Ex.: 123456789012345"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-waba">WABA ID (WhatsApp Business Account) *</Label>
              <FieldHelp text="É diferente do Phone Number ID. Usado para consultar templates na Meta." />
            </div>
            <Input
              id="integracao-waba"
              inputMode="numeric"
              value={form.waba_id}
              onChange={(event) => update("waba_id", event.target.value.replace(/\D/g, ""))}
              placeholder="ID da conta WhatsApp Business"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-template">Nome do template *</Label>
              <FieldHelp text="Nome exato do template cadastrado na Meta, como retorno_chamada_perdida." />
            </div>
            <Input
              id="integracao-template"
              value={form.template_nome}
              onChange={(event) => update("template_nome", event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-idioma">Idioma *</Label>
              <FieldHelp text="Código de idioma do template aprovado na Meta, como pt_BR." />
            </div>
            <Input
              id="integracao-idioma"
              value={form.template_idioma}
              onChange={(event) => update("template_idioma", event.target.value)}
              placeholder="pt_BR"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="integracao-token">
                Access Token {editing ? "(opcional na edição)" : "*"}
              </Label>
              <FieldHelp
                text={
                  editing
                    ? "Deixe vazio para manter o token criptografado atual. Um novo token substitui o anterior."
                    : "Token de acesso da Meta. Será criptografado no agente e nunca retornado pela API."
                }
              />
            </div>
            <Input
              id="integracao-token"
              type="password"
              autoComplete="new-password"
              value={form.access_token}
              onChange={(event) => update("access_token", event.target.value)}
              placeholder={editing ? "Vazio = manter token atual" : "Cole o token da Meta"}
              required={!editing}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.ativo}
              onChange={(event) => update("ativo", event.target.checked)}
            />
            Integração ativa
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {mutation.isPending
                ? "Salvando…"
                : editing
                  ? "Salvar alterações"
                  : "Criar integração"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreviewDialog({
  open,
  onOpenChange,
  item,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  item: IntegracaoComWaba | null;
  tenantId: number;
}) {
  const templateFn = useServerFn(getIntegracaoTemplate);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["integracao-template", tenantId, item?.id],
    queryFn: () => templateFn({ data: { tenant_id: tenantId, id: item!.id } }),
    enabled: open && !!tenantId && !!item,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const template = data?.template;
  const components = template?.components ?? [];
  const nomeEmpresa = data?.integracao?.nome_empresa ?? item?.nome_empresa ?? "";
  const preencher = (value: string | null | undefined) =>
    (value ?? "").replace(/\{\{\s*1\s*\}\}/g, nomeEmpresa);
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévia do template WhatsApp</DialogTitle>
          <DialogDescription>
            Conteúdo consultado diretamente na Meta para {item?.nome_empresa ?? "esta integração"}.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Consultando template na Meta…
          </div>
        ) : error ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Tentar novamente
            </Button>
          </div>
        ) : template ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={template.status === "APPROVED" ? "default" : "secondary"}>
                {template.status}
              </Badge>
              <Badge variant="outline">{template.language}</Badge>
              <Badge variant="outline">{template.category}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Template: </span>
              {template.name}
            </div>

            <div className="rounded-xl bg-[#e7f0e4] p-4">
              <div className="ml-auto max-w-[95%] space-y-2 rounded-lg bg-white p-3 text-sm text-slate-800 shadow-sm">
                {header?.text ? (
                  <p className="whitespace-pre-wrap font-semibold">{preencher(header.text)}</p>
                ) : header?.format && header.format !== "TEXT" ? (
                  <p className="text-xs italic text-slate-500">
                    Cabeçalho de mídia ({header.format}) — não exibido nesta prévia
                  </p>
                ) : null}
                {body?.text ? (
                  <p className="whitespace-pre-wrap break-words">{preencher(body.text)}</p>
                ) : (
                  <p className="italic text-slate-500">Este template não possui corpo de texto.</p>
                )}
                {footer?.text && (
                  <p className="border-t pt-2 text-xs text-slate-500">{preencher(footer.text)}</p>
                )}
              </div>
              {buttons.length > 0 && (
                <div className="ml-auto mt-2 max-w-[95%] space-y-1">
                  {buttons.map((button, index) => (
                    <div
                      key={`${button.type}-${index}`}
                      className="rounded-md bg-white px-3 py-2 text-center text-sm font-medium text-emerald-700"
                    >
                      {button.text ?? button.type}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Visualização aproximada. Apenas a variável {"{{1}}"} é substituída pelo nome da
              empresa; outras variáveis podem aparecer sem preenchimento.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Atualizar da Meta
              </Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem dados do template.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClienteIntegracoes() {
  const { tenantId } = useClienteContext();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IntegracaoComWaba | null>(null);
  const [deleting, setDeleting] = useState<IntegracaoComWaba | null>(null);
  const [previewItem, setPreviewItem] = useState<IntegracaoComWaba | null>(null);

  const listFn = useServerFn(listIntegracoes);
  const deleteFn = useServerFn(deleteIntegracao);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["integracoes", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id, tenant_id: tenantId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["integracoes", tenantId] });
      toast.success("Integração excluída");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const integracoes: IntegracaoComWaba[] = data?.integracoes ?? [];
  const termo = busca.trim().toLowerCase();
  const filtered = integracoes.filter(
    (item) =>
      !termo ||
      (item.nome_empresa ?? "").toLowerCase().includes(termo) ||
      (item.provider ?? "").toLowerCase().includes(termo) ||
      String(item.remetente ?? "").includes(termo) ||
      String(item.waba_id ?? "").includes(termo) ||
      (item.template_nome ?? "").toLowerCase().includes(termo) ||
      (item.dids ?? []).some((did) => did.includes(termo)),
  );
  const totalAtivas = integracoes.filter((item) => Boolean(item.ativo)).length;
  const totalDids = new Set(integracoes.flatMap((item) => item.dids ?? [])).size;

  const refresh = async () => {
    const result = await refetch();
    toast[result.isError ? "error" : "success"](
      result.isError ? "Erro ao atualizar integrações" : "Integrações atualizadas",
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Integrações</h1>
          <p className="text-sm text-muted-foreground">WhatsApp da empresa e números vinculados.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void refresh()}
            disabled={!tenantId || isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {isAdmin && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!tenantId}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova integração
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Integrações</p>
              <p className="text-3xl font-bold">{integracoes.length}</p>
            </div>
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Ativas</p>
              <p className="text-3xl font-bold">{totalAtivas}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">DIDs vinculados</p>
              <p className="text-3xl font-bold">{totalDids}</p>
            </div>
            <Phone className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <CardTitle>WhatsApp</CardTitle>
              <CardDescription>Integrações cadastradas no tenant atual.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Empresa, DID, template, WABA…"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {!tenantId ? (
            <p className="py-12 text-center text-muted-foreground">
              Aguardando identificação do cliente…
            </p>
          ) : isLoading ? (
            <div className="flex justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-destructive">
                Falha ao listar integrações: {(error as Error).message}
              </p>
              <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {busca ? "Nenhum resultado." : "Nenhuma integração cadastrada."}
            </p>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    <strong>{item.nome_empresa || `Integração #${item.id}`}</strong>
                    <Badge variant="outline">Meta Cloud API</Badge>
                    <Badge variant={item.ativo ? "default" : "secondary"}>
                      {item.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                    <Badge variant="secondary">
                      {item.total_dids ?? (item.dids ?? []).length} DID(s)
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPreviewItem(item)}>
                      <Eye className="mr-2 h-4 w-4" /> Visualizar mensagem
                    </Button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar integração"
                          onClick={() => {
                            setEditing(item);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir integração"
                          onClick={() => setDeleting(item)}
                          disabled={(item.total_dids ?? (item.dids ?? []).length) > 0}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Phone Number ID: </span>
                    <span className="font-mono">{item.remetente}</span>
                  </p>
                  <p>
                    <span className="font-medium">WABA ID: </span>
                    <span className="font-mono">{item.waba_id || "Não configurado"}</span>
                  </p>
                  <p>
                    <span className="font-medium">Template: </span>
                    {item.template_nome}
                  </p>
                  <p>
                    <span className="font-medium">Idioma: </span>
                    {item.template_idioma}
                  </p>
                  <p className="flex items-center gap-1.5">
                    {item.credencial_configurada ? (
                      <KeyRound className="h-4 w-4 text-green-600" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                    )}
                    {item.credencial_configurada ? "Token configurado" : "Token não configurado"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(item.dids ?? []).length > 0 ? (
                    item.dids.map((did) => (
                      <Badge key={did} variant="secondary">
                        <Phone className="mr-1 h-3 w-3" />
                        {did}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum DID vinculado</p>
                  )}
                </div>
                {isAdmin && (item.total_dids ?? (item.dids ?? []).length) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Para excluir, desvincule primeiro os DIDs na página de Roteamento.
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {tenantId > 0 && (
        <>
          <ItemDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            item={editing}
            tenantId={tenantId}
          />
          <TemplatePreviewDialog
            open={previewItem !== null}
            onOpenChange={(value) => {
              if (!value) setPreviewItem(null);
            }}
            item={previewItem}
            tenantId={tenantId}
          />
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(value) => {
          if (!value && !deleteMutation.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir integração?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação exclui a configuração WhatsApp de {deleting?.nome_empresa}. Não poderá ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || Boolean(deleting?.total_dids)}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) deleteMutation.mutate(deleting.id);
              }}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ClienteIntegracoes;
