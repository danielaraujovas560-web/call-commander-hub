const RAMAL_CREDS_KEY = "pabx_ramal_creds";

export type RamalCreds = {
  sip_username: string;
  sip_password: string;
  wss_url: string;
  sip_domain: string;
  nome: string | null;
  ramal: string;
};

export function getStoredRamalCreds(): RamalCreds | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(RAMAL_CREDS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RamalCreds;
  } catch {
    return null;
  }
}

export function setStoredRamalCreds(creds: RamalCreds | null) {
  if (typeof window === "undefined") return;
  if (creds) window.localStorage.setItem(RAMAL_CREDS_KEY, JSON.stringify(creds));
  else window.localStorage.removeItem(RAMAL_CREDS_KEY);
}
