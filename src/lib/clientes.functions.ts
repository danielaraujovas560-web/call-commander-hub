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
    // Admins see all; clientes see only tenants they are linked to (via RLS).
    const { data, error } = await context.supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { clientes: (data ?? []) as Cliente[] };
  });

// ---------- CREATE ----------
// Clientes são criados sem usuário. O admin cria o usuário separadamente
// em "Administração → Usuários" e vincula ao tenant deste cliente.
const createSchema = z.object({
  cnpj: z.string().trim().min(11).max(20),
  razao_social: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(255),
  tenant_id: z.number().int().positive(),
  quantidade_ramais: z.number().int().min(0).max(10000).default(0),
});

export const createCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("clientes")
      .insert({
        user_id: null,
        tenant_id: data.tenant_id,
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        email: data.email,
        login: null,
        quantidade_ramais: data.quantidade_ramais,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true, cliente: row };
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rowPatch: any = {};
    if (data.cnpj !== undefined) rowPatch.cnpj = data.cnpj;
    if (data.razao_social !== undefined) rowPatch.razao_social = data.razao_social;
    if (data.email !== undefined) rowPatch.email = data.email;
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
    const { error } = await supabaseAdmin.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
