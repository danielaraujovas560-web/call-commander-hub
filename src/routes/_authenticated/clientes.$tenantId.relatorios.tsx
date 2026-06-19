import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  PhoneIncoming,
  PhoneOutgoing,
  ListOrdered,
  PhoneCall,
  Star,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComingSoonPage } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Cliente — Painel PABX" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-6 w-6" /> Relatórios
      </h1>

      <Tabs defaultValue="entrada" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="entrada" className="gap-2">
            <PhoneIncoming className="h-4 w-4" /> Entrada
          </TabsTrigger>
          <TabsTrigger value="saida" className="gap-2">
            <PhoneOutgoing className="h-4 w-4" /> Saída
          </TabsTrigger>
          <TabsTrigger value="filas" className="gap-2">
            <ListOrdered className="h-4 w-4" /> Filas
          </TabsTrigger>
          <TabsTrigger value="ramais" className="gap-2">
            <PhoneCall className="h-4 w-4" /> Ramais
          </TabsTrigger>
          <TabsTrigger value="satisfacao" className="gap-2">
            <Star className="h-4 w-4" /> Satisfação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entrada" className="mt-4">
          <ComingSoonPage
            icon={<PhoneIncoming className="h-6 w-6" />}
            title="Chamadas de entrada"
            description="Volume, duração e taxa de atendimento das chamadas recebidas."
          />
        </TabsContent>
        <TabsContent value="saida" className="mt-4">
          <ComingSoonPage
            icon={<PhoneOutgoing className="h-6 w-6" />}
            title="Chamadas de saída"
            description="Chamadas originadas por ramal, custo e destino."
          />
        </TabsContent>
        <TabsContent value="filas" className="mt-4">
          <ComingSoonPage
            icon={<ListOrdered className="h-6 w-6" />}
            title="Filas"
            description="SLA, tempo médio de espera e abandono por fila."
          />
        </TabsContent>
        <TabsContent value="ramais" className="mt-4">
          <ComingSoonPage
            icon={<PhoneCall className="h-6 w-6" />}
            title="Ramais"
            description="Produtividade, login/logout e estatísticas por ramal."
          />
        </TabsContent>
        <TabsContent value="satisfacao" className="mt-4">
          <ComingSoonPage
            icon={<Star className="h-6 w-6" />}
            title="Pesquisa de satisfação"
            description="Notas e comentários das pesquisas pós-atendimento."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
