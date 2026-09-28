import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { authenticatedAgentFetch } from "./agent.server";

export interface Firewall {
  id: number;
  ip: string;
  tipo: "WHITELIST" | "BLACKLIST";
  motivo: string | null;
  origem: "MANUAL" | "AUTO";
  ativo: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FirewallInput = z.object({
  ip: z.string().min(1),
  tipo: z.enum(["WHITELIST", "BLACKLIST"]),
  motivo: z.string().optional(),
  expires_at: z.string().optional(),
});

export const listFirewall = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const res = await authenticatedAgentFetch<{ firewall: Firewall[]; warn?: string }>(
      context,
      "/firewall",
    );
    return { firewall: res.firewall ?? [], warn: res.warn };
  });

export const createFirewall = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => FirewallInput.parse(d))
  .handler(async ({ data, context }) => {
    const { ...body } = data;
    return await authenticatedAgentFetch<{ ok: true; id: number }>(context, "/firewall", {
      method: "POST",
      body,
    });
  });

export const deleteFirewall = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        ip: z.string().min(1),
        tipo: z.enum(["WHITELIST", "BLACKLIST"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    return await authenticatedAgentFetch<{ ok: true }>(context, `/firewall/${data.id}`, {
      method: "DELETE",
      body: { ip: data.ip, tipo: data.tipo },
    });
  });
