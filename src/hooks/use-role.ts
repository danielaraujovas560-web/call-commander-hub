import { useQuery } from "@tanstack/react-query";
import { getStoredToken, decodeTokenPayload } from "@/lib/auth/attach-auth";

export type AppRole = "admin" | "cliente";

export function useRole() {
  return useQuery({
    queryKey: ["my-role"],
    queryFn: async (): Promise<AppRole | null> => {
      const token = getStoredToken();
      if (!token) return null;
      const payload = decodeTokenPayload(token);
      return (payload?.role as AppRole | undefined) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useIsAdmin() {
  const { data, isLoading } = useRole();
  return { isAdmin: data === "admin", isLoading };
}
