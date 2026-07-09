import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./require-auth";

// Confirma que o Bearer token é válido e retorna userId/role — sem bater no
// pabx-agent, já que requireAuth verifica o JWT localmente. Usado no guard
// de rota _authenticated (equivalente ao antigo supabase.auth.getUser()).
export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return { userId: context.userId, role: context.role };
  });
