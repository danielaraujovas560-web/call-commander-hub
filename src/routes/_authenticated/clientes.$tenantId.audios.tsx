import { createFileRoute } from "@tanstack/react-router";
import { Music } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/audios")({
  head: () => ({ meta: [{ title: "Áudios — Cliente — Painel PABX" }] }),
  component: () => (
    <ComingSoonPage
      icon={<Music className="h-6 w-6" />}
      title="Áudios"
      description="Faça upload de prompts, saudações e mensagens da URA."
    />
  ),
});
