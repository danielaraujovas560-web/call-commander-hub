import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId")({
  head: () => ({ meta: [{ title: "Cliente — Painel PABX" }] }),
  component: () => <Outlet />,
});
