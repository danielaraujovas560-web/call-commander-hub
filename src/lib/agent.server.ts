import process from "node:process";
import { createHash, createHmac } from "node:crypto";

// HMAC-signed client for talking to the user's PABX mini-agent.
// Server-only — never import from client code.

export type AgentMethod = "GET" | "POST" | "DELETE" | "PUT";

function getConfig() {
  const url = process.env.PABX_AGENT_URL;
  const secret = process.env.PABX_AGENT_SECRET;
  if (!url || !secret) {
    throw new Error(
      "PABX agent não configurado: defina PABX_AGENT_URL e PABX_AGENT_SECRET.",
    );
  }
  return { url: url.replace(/\/$/, ""), secret };
}

function sign(secret: string, timestamp: string, method: string, path: string, body: string) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const payload = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function agentFetch<T = unknown>(
  path: string,
  options: {
    method?: AgentMethod;
    body?: unknown;
    tenantId?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { url, secret } = getConfig();
  const method = options.method ?? "GET";
  const bodyStr = options.body == null ? "" : JSON.stringify(options.body);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // path used for signing must include query string
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const signature = sign(secret, timestamp, method, fullPath, bodyStr);

  const headers: Record<string, string> = {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
    "Content-Type": "application/json",
  };
  if (options.tenantId != null) headers["X-Tenant-Id"] = String(options.tenantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const res = await fetch(`${url}${fullPath}`, {
      method,
      headers,
      body: bodyStr || undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Agente PABX retornou ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    clearTimeout(timeout);
  }
}

export function isAgentConfigured() {
  return Boolean(process.env.PABX_AGENT_URL && process.env.PABX_AGENT_SECRET);
}
