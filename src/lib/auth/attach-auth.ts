import { createMiddleware } from "@tanstack/react-start";

// Chave usada no localStorage para guardar o token retornado por /auth/login.
export const AUTH_TOKEN_KEY = "pabx_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Decodifica o payload do JWT só para exibição na UI (ex: role no menu).
// NÃO valida assinatura — isso é responsabilidade exclusiva do requireAuth
// no servidor. Nunca use isto para decisões de segurança no cliente.
export function decodeTokenPayload(token: string): { sub?: string; role?: string } | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    if (!payload) return true;

    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);

    if (!data.exp) return false;

    return Date.now() >= data.exp * 1000;
  } catch {
    return true;
  }
}

// Substitui attachSupabaseAuth. Deve ser registrado como functionMiddleware
// global em src/start.ts, senão o navegador nunca anexa o Bearer token.
export const attachAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token = getStoredToken();

    // Token expirado? Remove e volta para o login.
    if (token && isTokenExpired(token)) {
      setStoredToken(null);
      token = null;

      if (window.location.pathname !== "/auth") {
        window.location.replace("/auth");
      }
    }

    return next({
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    });
  },
);
