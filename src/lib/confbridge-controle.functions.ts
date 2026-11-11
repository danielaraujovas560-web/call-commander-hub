import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "@/lib/tenant.server";
import { authenticatedAgentFetch } from "@/lib/agent.server";

const tenantSchema = z.object({ tenant_id: z.number().int().positive().optional() });

export type CatalogoConferencia = {
  id: number;
  nome: string;
  ramal: string | null;
  tipo: "INTERNA" | "CHAMADA";
};

export const listarCatalogoConferencias = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: unknown) => tenantSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return authenticatedAgentFetch<{ conferencias: CatalogoConferencia[] }>(
      context, "/conferencias-controle/catalogo", { tenantId },
    );
  });

export const alterarMuteConfbridge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => tenantSchema.extend({
    id: z.number().int().positive(),
    tipo: z.enum(["INTERNA", "CHAMADA"]),
    canal: z.string().min(1),
    mutado: z.boolean(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return authenticatedAgentFetch<{ ok: true; mutado: boolean }>(
      context,
      `/conferencias-controle/${data.tipo}/${data.id}/mute`,
      { method: "POST", tenantId, body: { canal: data.canal, mutado: data.mutado } },
    );
  });
