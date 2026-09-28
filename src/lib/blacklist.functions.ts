import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface BlacklistItem {
  destino: string;
  regra: "Entrada" | "Saida";
  tipo: "Prefixo" | "Numero";
  ativo: boolean;
  motivo: string | null;
  data_hora_desbloqueio: string;
}

export const listBlacklist = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ blacklist: BlacklistItem[] }>(
      context,
      `/blacklist?tenant=${tenantId}`,
      {
        tenantId,
      },
    );
    return { tenantId, blacklist: res.blacklist ?? [] };
  });

export const createBlacklist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        destino: z.string().min(1).max(64),
        tenant_id: z.number().int().positive().optional(),
        regra: z.enum(["Entrada", "Saida"]),
        tipo: z.enum(["Prefixo", "Numero"]),
        motivo: z.string().max(100).optional(),
        data_hora_desbloqueio: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { tenant_id: _i, ...body } = data;
    await authenticatedAgentFetch(context, "/blacklist", { method: "POST", tenantId, body });
    return { ok: true };
  });

export const updateBlacklist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        destinoAtual: z.string().min(1).max(64),
        regraAtual: z.enum(["Entrada", "Saida"]),
        tipoAtual: z.enum(["Prefixo", "Numero"]),

        destino: z.string().min(1).max(64),
        tenant_id: z.number().int().positive().optional(),
        regra: z.enum(["Entrada", "Saida"]),
        tipo: z.enum(["Prefixo", "Numero"]),
        motivo: z.string().max(255).optional(),
        data_hora_desbloqueio: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const { destinoAtual, regraAtual, tipoAtual, tenant_id: _i, ...body } = data;
    await authenticatedAgentFetch(
      context,
      `/blacklist/${destinoAtual}/${regraAtual}/${tipoAtual}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
    return { ok: true };
  });

export const deleteBlacklist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        destino: z.string().min(1).max(64),
        tenant_id: z.number().int().positive().optional(),
        regra: z.enum(["Entrada", "Saida"]),
        tipo: z.enum(["Prefixo", "Numero"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(
      context,
      `/blacklist/${data.destino}/${data.regra}/${data.tipo}`,
      {
        method: "DELETE",
        tenantId,
      },
    );
    return { ok: true };
  });

const ToggleBlacklistAtivoInput = z.object({
  destino: z.string().min(1).max(64),
  tenant_id: z.number().int().positive().optional(),
  regra: z.enum(["Entrada", "Saida"]),
  tipo: z.enum(["Prefixo", "Numero"]),
  ativo: z.boolean(),
});

export const toggleBlacklistAtivo = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => ToggleBlacklistAtivoInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    await authenticatedAgentFetch(
      context,
      `/blacklist/${data.destino}/${data.regra}/${data.tipo}`,
      {
        method: "PUT",
        tenantId,
        body: { ativo: data.ativo },
      },
    );
    return { ok: true };
  });
