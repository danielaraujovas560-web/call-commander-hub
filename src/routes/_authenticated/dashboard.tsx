import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listClientes} from "@/lib/clientes.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useIsAdmin } from "@/hooks/use-role";
import { Mail, Phone, User, Clock, Star, GitBranch, PhoneCall, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DailyCallSummary } from "@/components/dashboard/DailyCallSummary";
import { enterprise, formatPhone } from "@/config";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel PABX" }] }),
  component: Dashboard,
});

function ClientesChart({ ativos, inativos }: { ativos: number; inativos: number }) {
  const total = ativos + inativos;

  const size = 180;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const pctAtivos = total > 0 ? Math.min(ativos / total, 1) : 0;

  const [animacao, setAnimacao] = useState(0);

  useEffect(() => {
    let frame: number;

    const inicio = performance.now();
    const duracao = 800;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracao, 1);

      setAnimacao(pctAtivos * easeOutCubic(progresso));

      if (progresso < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [pctAtivos]);

  const dash = c * animacao;

  const ativosAnimados = Math.round(ativos * (animacao / pctAtivos || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes ativos x inativos</CardTitle>

        <CardDescription>Visão geral da base de clientes cadastrados</CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-[220px] items-center justify-center gap-8">
        <svg width={size} height={size} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />

          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-primary"
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{
              transform: "rotate(90deg) scaleX(-1)",
              transformOrigin: "center",
            }}
          />

          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: 26 }}
          >
            {ativosAnimados}/{total}
          </text>
        </svg>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />

            <span>
              Ativos: <strong>{ativos}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" />

            <span>
              Inativos: <strong>{inativos}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { isAdmin } = useIsAdmin();
  const fn = useServerFn(listClientes);
  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fn(),
    enabled: isAdmin,
  });

  const clientes = data?.clientes ?? [];
  const ativos = clientes.filter((c) => c.ativo).length;
  const inativos = clientes.length - ativos;
  const chartData = [
    { name: "Ativos", value: ativos },
    { name: "Inativos", value: inativos },
  ];

  return (
    <div className="relative min-h-[calc(100vh-8rem)] space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Bem-vindo ao seu painel</h1>
        <p className="text-muted-foreground">Gerencie clientes e ramais do seu PABX virtual.</p>
      </div>

      <div className={isAdmin ? "grid gap-4 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
        <Card className="h-90">
          <CardHeader>
            <CardTitle>Funções do PABX</CardTitle>
            <CardDescription>Recursos atualmente disponíveis no sistema</CardDescription>
          </CardHeader>

  <CardContent>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Phone className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Ramais, filas e URAs</p>
          <p className="text-xs text-muted-foreground">
            Criação e gerenciamento dos recursos de telefonia.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Horário de atendimento</p>
          <p className="text-xs text-muted-foreground">
            Modelo personalizado para regras de atendimento.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Star className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Pesquisa de satisfação</p>
          <p className="text-xs text-muted-foreground">
            Pesquisas de satisfação ativas e receptivas.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <GitBranch className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Roteamento inteligente</p>
          <p className="text-xs text-muted-foreground">
            Regras de roteamento personalizadas para cada cenário.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <PhoneCall className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Transferência entre ramais</p>
          <p className="text-xs text-muted-foreground">
            Permite transferências de chamadas entre os ramais do PABX.
          </p>
        </div>
      </div>
    </div>
  </CardContent>
        </Card>

        {/* CONTATO / SUPORTE */}
        <Card>
          <CardHeader>
            <CardTitle>Contato / Suporte</CardTitle>
            <CardDescription>Fale com quem cuida desse painel</CardDescription>
          </CardHeader>

  <CardContent className="space-y-3">
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <User className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Desenvolvedor</p>
        <p className="truncate text-sm font-medium">
          {isAdmin ? "Daniel Araujo" : enterprise.name}
        </p>
      </div>
    </div>

    <a
      href="mailto:danielaraujovas560@gmail.com"
      className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Mail className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Email para chamados</p>
        <p className="truncate text-sm font-medium">
          {enterprise.email}
        </p>
      </div>
    </a>

<a
  href={`https://wa.me/${enterprise.whatsapp}?text=${encodeURIComponent(
    "Olá Daniel! Preciso de suporte com o PABX.\n\n" +
    "Razão Social: \n" + 
    "CPF/CNPJ: \n" +
    "Descrição do problema: "
  )}`}
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted"
>
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <MessageCircle className="h-4 w-4" />
      </div>

      <div>
        <p className="text-xs text-muted-foreground">WhatsApp para chamados</p>
        <p className="text-sm font-medium">
          {formatPhone(enterprise.whatsapp)}
        </p>
      </div>
    </a>
  </CardContent>
        </Card>

        {/* GRÁFICO DE CLIENTES */}
        {isAdmin && <ClientesChart ativos={ativos} inativos={inativos} />}

        {/* CARD VAZIO 2 */}
        {isAdmin && <DailyCallSummary />}
      </div>
      <a
        href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 text-xs text-muted-foreground hover:underline"
      >
        © {new Date().getFullYear()} Daniel Araujo
      </a>
    </div>
  );
}
