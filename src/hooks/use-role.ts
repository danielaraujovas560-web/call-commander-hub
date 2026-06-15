import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "cliente";

export function useRole() {
  return useQuery({
    queryKey: ["my-role"],
    queryFn: async (): Promise<AppRole | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .order("role", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data?.role ?? null) as AppRole | null;
    },
    staleTime: 60_000,
  });
}

export function useIsAdmin() {
  const { data, isLoading } = useRole();
  return { isAdmin: data === "admin", isLoading };
}
