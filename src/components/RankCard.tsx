import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LucideIcon } from "lucide-react";

interface RankItem {
  nome: string;
  total: number;
}

interface RankCardProps {
  titulo: string;
  descricao: string;
  dados: RankItem[];
  Icon: LucideIcon;
  iconColor: string;
}

export function RankCard({
  titulo,
  descricao,
  dados,
  Icon,
  iconColor,
}: RankCardProps) {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-6">
      <div className="mb-6">
        <h3 className="flex items-center gap-2 text-xl font-bold">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          {titulo}
        </h3>

        <p className="text-sm text-muted-foreground">
          {descricao}
        </p>
      </div>

      {dados.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum registro encontrado.
        </p>
      ) : (
        <div className="space-y-6">
          {dados.map((r, idx) => {
            const maior = dados[0]?.total || 1;
            const porcentagem = (r.total / maior) * 100;

            const medal =
              idx === 0 ? "🥇" :
              idx === 1 ? "🥈" :
              idx === 2 ? "🥉" :
              `${idx + 1}º`;

            return (
              <div key={r.nome}>
                <div className="flex items-center justify-between mb-2">

                  <div className="flex items-center gap-3">

                    <span className="text-xl w-8 text-center">
                      {medal}
                    </span>

                    <div>
                      <div className="font-semibold">
                        DDD {r.nome}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Código de área
                      </div>
                    </div>

                  </div>

                  <Badge variant="secondary">
                    {r.total} chamadas
                  </Badge>

                </div>

                <Progress
                  value={porcentagem}
                  className="h-3 rounded-full"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
