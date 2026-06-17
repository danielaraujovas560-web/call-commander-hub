import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve the active tenant_id for the signed-in user.
// Admins do not need a tenants_link binding: they can access any tenant
// that exists in tenants_link. Regular users must have an explicit link.
export async function resolveTenantId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("tenants_link")
    .select("tenant_id, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data.tenant_id;

  // No personal binding — if admin, fall back to any existing tenant.
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: anyLink } = await supabaseAdmin
      .from("tenants_link")
      .select("tenant_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyLink) return anyLink.tenant_id;
    throw new Error(
      "Nenhum tenant cadastrado no sistema. Crie um usuário cliente vinculado a um tenant_id primeiro.",
    );
  }

  throw new Error(
    "Nenhum tenant vinculado ao seu usuário. Peça a um administrador para vincular seu acesso.",
  );
}
