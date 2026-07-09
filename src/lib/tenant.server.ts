// Resolve o tenant_id ativo para o usuário logado, delegando ao pabx-agent
// (que já sabe checar tenants_link/clientes no MariaDB). `token` é o JWT do
// usuário, obtido via requireAuth e repassado como Bearer.
export async function resolveTenantId(token: string, override?: number): Promise<number> {
  const { agentFetch } = await import("./agent.server");
  const qs = override != null ? `?tenant_id=${override}` : "";
  const res = await agentFetch<{ tenant_id: number }>(`/tenant/resolve${qs}`, {
    bearerToken: token,
  });
  return res.tenant_id;
}
