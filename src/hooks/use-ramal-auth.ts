import { useCallback, useEffect, useRef, useState } from "react";

import { getStoredRamalCreds, setStoredRamalCreds, type RamalCreds } from "@/lib/auth/ramal-creds";

import { refreshRamalToken, logoutRamal } from "@/lib/ramais.functions";

function getJwtExpiration(token: string): number | null {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");

    const decoded = JSON.parse(window.atob(normalized));

    if (typeof decoded.exp !== "number") {
      return null;
    }

    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

export function useRamalAuth() {
  const [creds, setCreds] = useState<RamalCreds | null>(() => getStoredRamalCreds());

  const refreshPromiseRef = useRef<Promise<RamalCreds | null> | null>(null);

  const refresh = useCallback(async (): Promise<RamalCreds | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const current = getStoredRamalCreds();

    if (!current?.refreshToken) {
      setCreds(null);
      return null;
    }

    const promise = (async () => {
      try {
        const response = await refreshRamalToken({
          data: {
            refreshToken: current.refreshToken,
          },
        });

        const updated: RamalCreds = {
          ...current,
          token: response.token,
          refreshToken: response.refreshToken,
          ramal: response.ramal,
          nome: response.nome,
          sip_username: response.sip_username,
          sip_password: response.sip_password,
          wss_url: response.wss_url,
          sip_domain: response.sip_domain,
        };

        setStoredRamalCreds(updated);
        setCreds(updated);

        return updated;
      } catch (error) {
        console.error("[RAMAL-AUTH] Falha ao renovar sessão:", error);

        setStoredRamalCreds(null);
        setCreds(null);

        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;

    return promise;
  }, []);

  const logout = useCallback(async () => {
    const current = getStoredRamalCreds();

    try {
      if (current?.refreshToken) {
        await logoutRamal({
          data: {
            refreshToken: current.refreshToken,
          },
        });
      }
    } catch (error) {
      console.warn("[RAMAL-AUTH] Falha ao revogar sessão:", error);
    } finally {
      setStoredRamalCreds(null);
      setCreds(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function agendarRefresh() {
      const current = getStoredRamalCreds();

      if (!current) {
        if (!cancelled) {
          setCreds(null);
        }

        return;
      }

      const expiraEm = getJwtExpiration(current.token);

      if (!expiraEm) {
        console.warn("[RAMAL-AUTH] Não foi possível ler expiração do JWT. Renovando...");

        await refresh();

        return;
      }

      const agora = Date.now();
      const tempoRestante = expiraEm - agora;

      const margemRefresh = 10 * 60 * 1000;

      if (tempoRestante <= margemRefresh) {
        const novoCreds = await refresh();

        if (!novoCreds || cancelled) {
          return;
        }

        /*
         * O refresh alterou o token salvo e o estado `creds`.
         *
         * O efeito será executado novamente por causa de:
         *
         *     [refresh, creds?.token]
         *
         * Portanto, não precisamos criar outro timer aqui.
         */

        return;
      }

      if (!cancelled) {
        setCreds(current);
      }

      const delay = Math.max(tempoRestante - margemRefresh, 1000);

      timer = setTimeout(() => {
        if (!cancelled) {
          void agendarRefresh();
        }
      }, delay);
    }

    void agendarRefresh();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [refresh, creds?.token]);

  return {
    creds,
    refresh,
    logout,
  };
}
