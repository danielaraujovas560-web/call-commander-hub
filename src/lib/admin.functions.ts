import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// ---------- LIST USERS ----------
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) throw new Error(authErr.message);

    const ids = authData.users.map((u) => u.id);
    const [{ data: roles }, { data: profiles }, { data: links }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, nome, email").in("id", ids),
      supabaseAdmin
        .from("tenants_link")
        .select("user_id, tenant_id, label, is_default")
        .in("user_id", ids),
    ]);

    return {
      users: authData.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        nome: profiles?.find((p) => p.id === u.id)?.nome ?? null,
        role: (roles?.find((r) => r.user_id === u.id)?.role ?? "cliente") as
          | "admin"
          | "cliente",
        tenants: (links ?? [])
          .filter((l) => l.user_id === u.id)
          .map((l) => ({
            tenant_id: l.tenant_id,
            label: l.label,
            is_default: l.is_default,
          })),
      })),
    };
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    // Override default role from trigger if admin requested
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
    }

    if (data.tenant_id) {
      await supabaseAdmin.from("tenants_link").insert({
        user_id: uid,
        tenant_id: data.tenant_id,
        label: data.tenant_label ?? null,
        is_default: true,
      });
    }

    return { ok: true, id: uid };
  });

// ---------- DELETE USER ----------
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode remover sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- SET ROLE ----------
export const setRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "cliente"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TENANT LINKS ----------
export const addTenantLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_default) {
      await supabaseAdmin
        .from("tenants_link")
        .update({ is_default: false })
        .eq("user_id", data.user_id);
    }
    const { error } = await supabaseAdmin.from("tenants_link").insert({
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      label: data.label ?? null,
      is_default: data.is_default,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTenantLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), tenant_id: z.number().int() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants_link")
      .delete()
      .eq("user_id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
