import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/filas")({
  head: () => ({ meta: [{ title: "Filas — Cliente — Painel PABX" }] }),
  component: () => (
    <ComingSoonPage
      icon={<ListOrdered className="h-6 w-6" />}
      title="Filas de atendimento"
      description="Crie e gerencie filas, estratégias de distribuição e agentes."
    />
  ),
});
