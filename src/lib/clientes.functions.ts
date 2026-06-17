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
export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Admins see all; clientes see only their own (RLS-enforced).
    const { data, error } = await context.supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { clientes: (data ?? []) as Cliente[] };
  });

// ---------- CREATE ----------
const createSchema = z.object({
  cnpj: z.string().trim().min(11).max(20),
  razao_social: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(255),
  senha: z.string().min(8).max(72),
  login: z.string().trim().min(1).max(80).optional(),
  tenant_id: z.number().int().positive(),
  quantidade_ramais: z.number().int().min(0).max(10000).default(0),
});

export const createCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Create Supabase auth user (handle_new_user trigger assigns role=cliente)
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.razao_social },
    });
    if (authErr) throw new Error(authErr.message);
    const uid = created.user!.id;

    try {
      // 2. Link user to tenant
      const { error: linkErr } = await supabaseAdmin.from("tenants_link").insert({
        user_id: uid,
        tenant_id: data.tenant_id,
        label: data.razao_social,
        is_default: true,
      });
      if (linkErr) throw new Error(linkErr.message);

      // 3. Insert cliente row
      const { data: row, error: insErr } = await supabaseAdmin
        .from("clientes")
        .insert({
          user_id: uid,
          tenant_id: data.tenant_id,
          cnpj: data.cnpj,
          razao_social: data.razao_social,
          email: data.email,
          login: data.login ?? null,
          quantidade_ramais: data.quantidade_ramais,
        })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);

      return { ok: true, cliente: row };
    } catch (e) {
      // Roll back the auth user so the form can be retried
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      throw e;
    }
  });

// ---------- UPDATE ----------
const updateSchema = z.object({
  id: z.string().uuid(),
  cnpj: z.string().trim().min(11).max(20).optional(),
  razao_social: z.string().trim().min(1).max(180).optional(),
  email: z.string().trim().email().max(255).optional(),
  senha: z.string().min(8).max(72).optional(),
  login: z.string().trim().min(1).max(80).nullable().optional(),
  quantidade_ramais: z.number().int().min(0).max(10000).optional(),
});

export const updateCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: getErr } = await supabaseAdmin
      .from("clientes")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (getErr) throw new Error(getErr.message);

    // Auth side
    if (existing.user_id && (data.email || data.senha || data.razao_social)) {
      const patch: any = {};
      if (data.email) patch.email = data.email;
      if (data.senha) patch.password = data.senha;
      if (data.razao_social) patch.user_metadata = { nome: data.razao_social };
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        existing.user_id,
        patch,
      );
      if (error) throw new Error(error.message);

      if (data.razao_social || data.email) {
        const pp: any = {};
        if (data.razao_social) pp.nome = data.razao_social;
        if (data.email) pp.email = data.email;
        await supabaseAdmin.from("profiles").update(pp).eq("id", existing.user_id);
      }
    }

    // Cliente row
    const rowPatch: any = {};
    if (data.cnpj !== undefined) rowPatch.cnpj = data.cnpj;
    if (data.razao_social !== undefined) rowPatch.razao_social = data.razao_social;
    if (data.email !== undefined) rowPatch.email = data.email;
    if (data.login !== undefined) rowPatch.login = data.login;
    if (data.quantidade_ramais !== undefined)
      rowPatch.quantidade_ramais = data.quantidade_ramais;

    if (Object.keys(rowPatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("clientes")
        .update(rowPatch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

// ---------- DELETE ----------
export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: getErr } = await supabaseAdmin
      .from("clientes")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (getErr) throw new Error(getErr.message);

    await supabaseAdmin.from("clientes").delete().eq("id", data.id);
    if (existing.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(existing.user_id).catch(() => {});
    }
    return { ok: true };
  });

// ---------- GET ONE (for cliente detail page) ----------
export const getClienteByTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clientes")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { cliente: row as Cliente | null };
  });
