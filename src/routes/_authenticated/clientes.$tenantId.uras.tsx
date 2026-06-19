import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/uras")({
  head: () => ({ meta: [{ title: "URAs — Cliente — Painel PABX" }] }),
  component: () => (
    <ComingSoonPage
      icon={<Workflow className="h-6 w-6" />}
      title="URAs (menus de atendimento)"
      description="Monte fluxos de atendimento com opções, horários e transferências."
    />
  ),
});
