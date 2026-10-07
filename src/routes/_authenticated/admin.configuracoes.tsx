import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Brain,
  MessageSquareHeart,
  FileSpreadsheet,
  Settings2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ToggleAtivoBadge } from "@/components/toggle-ativo-badge";

import { listConfiguracoes, updateConfiguracoes } from "@/lib/configuracoes.functions";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({
    meta: [{ title: "Configurações — Painel PABX" }],
  }),

  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },

  component: ConfigPage,
});

function ConfigPage() {
  const listConfigs = useServerFn(listConfiguracoes);

  const { data: configuracoes = [], isLoading } = useQuery({
    queryKey: ["config-geral"],
    queryFn: () => listConfigs(),
  });

  const getConfig = (chave: string) => configuracoes.find((config) => config.chave === chave);

  const maxAuthFailures = getConfig("firewall.max_auth_failures");
  const autoBlock = getConfig("firewall.auto_block");

  const moduloIa = getConfig("modulos.ia");
  const moduloSatisfacao = getConfig("modulos.pesquisa_satisfacao");
  const moduloCdr = getConfig("modulos.cdr_csv");

  const isEnabled = (value?: string) => value === "true";

  const qc = useQueryClient();

  const updateConfiguracoesFn = useServerFn(updateConfiguracoes);

  const toggleConfigMut = useMutation({
    mutationFn: ({ chave, valor }: { chave: string; valor: boolean }) =>
      updateConfiguracoesFn({
        data: {
          chave,
          valor,
        },
      }),

    onSuccess: () => {
      toast.success("Configuração atualizada");

      qc.invalidateQueries({
        queryKey: ["config-geral"],
      });
    },

    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2">
          <Settings2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Configure o comportamento geral e os módulos disponíveis no PABX.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando configurações...</div>
      ) : (
        <div className="space-y-6">
          {/* Firewall */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <h2 className="font-semibold">Firewall</h2>
                <p className="text-sm text-muted-foreground">
                  Controle de proteção automática contra tentativas de autenticação inválidas.
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Proteção contra ataques</CardTitle>
                <CardDescription>
                  Configurações utilizadas pelo sistema de bloqueio automático.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <ConfigRow
                  title="Tentativas antes do bloqueio"
                  description={maxAuthFailures?.descricao}
                  value={maxAuthFailures?.valor ?? "—"}
                  badge="Padrão"
                />

                <ConfigRow
                  title="Bloqueio automático"
                  description={autoBlock?.descricao}
                  value={isEnabled(autoBlock?.valor) ? "Ativado" : "Desativado"}
                  status={isEnabled(autoBlock?.valor)}
                />
              </CardContent>
            </Card>
          </section>

          {/* Módulos */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />

              <div>
                <h2 className="font-semibold">Módulos</h2>
                <p className="text-sm text-muted-foreground">
                  Recursos adicionais disponíveis no PABX.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ModuleCard
                icon={Brain}
                title="Inteligência Artificial"
                description={
                  moduloIa?.descricao ?? "Recursos de inteligência artificial para o PABX."
                }
                enabled={isEnabled(moduloIa?.valor)}
                isPending={toggleConfigMut.isPending}
                onToggle={() => {
                  toggleConfigMut.mutate({
                    chave: "modulos.ia",
                    valor: !isEnabled(moduloIa?.valor),
                  });
                }}
              />

              <ModuleCard
                icon={MessageSquareHeart}
                title="Pesquisa de satisfação"
                description={
                  moduloSatisfacao?.descricao ??
                  "Permite realizar pesquisas de satisfação após as chamadas."
                }
                enabled={isEnabled(moduloSatisfacao?.valor)}
                isPending={toggleConfigMut.isPending}
                onToggle={() => {
                  toggleConfigMut.mutate({
                    chave: "modulos.pesquisa_satisfacao",
                    valor: !isEnabled(moduloSatisfacao.valor),
                  });
                }}
              />

              <ModuleCard
                icon={FileSpreadsheet}
                title="Exportação de CDR"
                description={
                  moduloCdr?.descricao ??
                  "Exportação personalizada dos registros de chamadas em CSV."
                }
                enabled={isEnabled(moduloCdr?.valor)}
                isPending={toggleConfigMut.isPending}
                onToggle={() => {
                  toggleConfigMut.mutate({
                    chave: "modulos.cdr_csv",
                    valor: !isEnabled(moduloCdr?.valor),
                  });
                }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ConfigRow({
  title,
  description,
  value,
  status,
  badge,
}: {
  title: string;
  description?: string;
  value: string;
  status?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{title}</p>

          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>

        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="shrink-0">
        {status === undefined ? (
          <Badge variant="outline">{value}</Badge>
        ) : status ? (
          <Badge className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ativado
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3.5 w-3.5" />
            Desativado
          </Badge>
        )}
      </div>
    </div>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  enabled,
  isPending,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5" />
            </div>

            <div>
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
          </div>

          <ToggleAtivoBadge ativo={enabled} isPending={isPending} onToggle={onToggle} />
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
