import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClienteByTenant } from "@/lib/clientes.functions";
import { ClienteContext } from "./_cliente-context";

export const Route = createFileRoute("/_authenticated/cliente")({
  head: () => ({ meta: [{ title: "Cliente — Painel PABX" }] }),
  component: ClienteLayout,
});

function ClienteLayout() {
  const fn = useServerFn(getClienteByTenant);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cliente-ativo"],
    queryFn: () => fn(),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  const cliente = data?.cliente;
  const tenantId = cliente?.tenant_id;

  return (
    <ClienteContext.Provider value={{ tenantId, cliente, isLoading, error }}>
      <Outlet />
    </ClienteContext.Provider>
  );
}
