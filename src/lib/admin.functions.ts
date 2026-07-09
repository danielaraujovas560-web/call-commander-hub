import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

// A checagem de admin (assertAdmin) agora acontece no próprio pabx-agent
// (middleware requireAdmin, que consulta user_roles no MariaDB). Se o
// usuário não for admin, agentFetch lança erro com a mensagem 403 do agente.

// ---------- LIST USERS ----------
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{
      users: {
        id: string;
        email: string;
        created_at: string;
        nome: string | null;
        role: "admin" | "cliente";
        tenants: { tenant_id: number; label: string | null; is_default: boolean }[];
      }[];
    }>("/admin/users", { bearerToken: context.token });
  });

// ---------- CREATE USER ----------
const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  nome: z.string().min(1).max(120),
  role: z.enum(["admin", "cliente"]).default("cliente"),
  tenant_id: z.number().int().positive().optional(),
  tenant_label: z.string().max(120).optional(),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true; id: string }>("/admin/users", {
      method: "POST",
      bearerToken: context.token,
      body: data,
    });
  });

// ---------- DELETE USER ----------
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true }>(`/admin/users/${data.user_id}/delete`, {
      method: "POST",
      bearerToken: context.token,
    });
  });

// ---------- SET ROLE ----------
export const setRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "cliente"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true }>(`/admin/users/${data.user_id}/role`, {
      method: "POST",
      bearerToken: context.token,
      body: { role: data.role },
    });
  });

// ---------- TENANT LINKS ----------
export const addTenantLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        tenant_id: z.number().int().positive(),
        label: z.string().max(120).optional(),
        is_default: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true }>("/admin/tenant-links", {
      method: "POST",
      bearerToken: context.token,
      body: data,
    });
  });

export const removeTenantLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), tenant_id: z.number().int() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    return await agentFetch<{ ok: true }>("/admin/tenant-links", {
      method: "DELETE",
      bearerToken: context.token,
      body: data,
    });
  });

// ---------- UPDATE USER (email / password / nome / role) ----------
const updateSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).max(72).optional(),
  nome: z.string().min(1).max(120).optional(),
  role: z.enum(["admin", "cliente"]).optional(),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const { user_id, ...body } = data;
    return await agentFetch<{ ok: true }>(`/admin/users/${user_id}`, {
      method: "PUT",
      bearerToken: context.token,
      body,
    });
  });
