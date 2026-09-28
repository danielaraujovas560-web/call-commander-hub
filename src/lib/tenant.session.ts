import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const TENANT_COOKIE_NAME = "active_tenant_id";

/**
 * Salva o Tenant ID no Cookie de forma segura
 */
export const setActiveTenantCookie = createServerFn({ method: "POST" })
  .validator((tenantId: number | string) => {
    const parsed = Number(tenantId);
    if (isNaN(parsed)) {
      throw new Error("Tenant ID inválido enviado para o cookie");
    }
    return String(parsed);
  })
  .handler(async ({ data: tenantId }) => {
    setCookie(TENANT_COOKIE_NAME, tenantId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });

    return { success: true };
  });

/**
 * Recupera o Tenant ID ativo salvo no Cookie
 */
export const getActiveTenantCookie = createServerFn({ method: "GET" }).handler(async () => {
  const tenantId = getCookie(TENANT_COOKIE_NAME);
  if (!tenantId) return null;

  const parsed = Number(tenantId);
  return isNaN(parsed) ? null : parsed;
});

/**
 * Limpa o cookie do tenant
 */
export const clearActiveTenantCookie = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(TENANT_COOKIE_NAME, { path: "/" });
  return { success: true };
});
