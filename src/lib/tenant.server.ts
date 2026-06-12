import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve the active tenant_id for the signed-in user.
// Returns the default link first, then the most recent.
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
  if (!data) {
    throw new Error(
      "Nenhum tenant vinculado ao seu usuário. Peça a um administrador para vincular seu acesso.",
    );
  }
  return data.tenant_id;
}
