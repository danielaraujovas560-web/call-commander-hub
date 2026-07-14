import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listClientes } from "@/lib/clientes.functions";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { useIsAdmin } from "@/hooks/use-role";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Mail, Phone, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel PABX" }] }),
  component: Dashboard,
});

const CORES = ["#16a34a", "#dc2626"]; // ativos, inativos

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
        <p className="text-muted-foreground">
          Gerencie clientes e ramais do seu PABX virtual.
        </p>
      </div>

      <div className={isAdmin ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Clientes ativos x inativos</CardTitle>
              <CardDescription>Visão geral da base de clientes cadastrados</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CORES[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Contato / Suporte</CardTitle>
            <CardDescription>Fale com quem cuida desse painel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Feito por: <strong>Daniel Araujo</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>Email para chamados: <strong>danielaraujovas560@gmail.com</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>Telefone para chamados: <strong>(27) 99293-0238</strong></span>
            </div>
          </CardContent>
        </Card>
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
