import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

export type Cliente = {
  id: string;
  user_id: string | null;
  tenant_id: number;
  cnpj: string;
  razao_social: string;
  email: string;
  login: string | null;
  quantidade_ramais: number;
  created_at: string;
  updated_at: string;
};

// ---------- LIST ----------
// Admin vê todos; cliente vê só os tenants vinculados a ele — isso já é
// filtrado dentro do pabx-agent (GET /clientes), sem precisar de RLS aqui.
export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { agentFetch } = await import("./agent.server");
    const res = await agentFetch<{ clientes: Cliente[] }>("/clientes", {
      bearerToken: context.token,
    });
    return { clientes: res.clientes ?? [] };
  });

// ---------- CREATE ----------
// Clientes são criados sem usuário. O admin cria o usuário separadamente
// em "Administração → Usuários" e vincula ao tenant deste cliente.
// O pabx-agent já cria/atualiza o tenant no MariaDB na mesma transação.
const createSchema = z.object({
  cnpj: z.string().trim().min(11).max(20),
  razao_social: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(255),
  tenant_id: z.number().int().positive(),
  quantidade_ramais: z.number().int().min(0).max(10000).default(0),
});

export const createCliente = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const res = await agentFetch<{ ok: true; cliente: Cliente }>("/clientes", {
      method: "POST",
      bearerToken: context.token,
      body: data,
    });
    return res;
  });

// ---------- UPDATE ----------
const updateSchema = z.object({
  id: z.string().uuid(),
  cnpj: z.string().trim().min(11).max(20).optional(),
  razao_social: z.string().trim().min(1).max(180).optional(),
  email: z.string().trim().email().max(255).optional(),
  quantidade_ramais: z.number().int().min(0).max(10000).optional(),
});

export const updateCliente = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const { id, ...body } = data;
    return await agentFetch<{ ok: true }>(`/clientes/${id}`, {
      method: "PUT",
      bearerToken: context.token,
      body,
    });
  });

// ---------- DELETE ----------
export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true }>(`/clientes/${data.id}`, {
      method: "DELETE",
      bearerToken: context.token,
    });
  });

// ---------- GET ONE (for cliente detail page) ----------
export const getClienteByTenant = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const res = await agentFetch<{ cliente: Cliente | null }>(
      `/clientes/by-tenant/${data.tenant_id}`,
      { bearerToken: context.token },
    );
    return { cliente: res.cliente };
  });
