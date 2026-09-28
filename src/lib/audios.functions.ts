import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface Audio {
  audio_identifier: string;
  display_name: string;
}

export const listAudios = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ tenant_id: z.number().int().positive().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    const res = await authenticatedAgentFetch<{ audios: Audio[]; warn?: string }>(
      context,
      `/audios`,
      { tenantId },
    );
    return { audios: res.audios ?? [], warn: res.warn };
  });

export const uploadAudio = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        display_name: z.string().min(1),
        extensao: z.enum(["wav", "mp3"]),
        conteudo_base64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{
      ok: true;
      audio_identifier: string;
      display_name: string;
    }>(context, "/audios", {
      method: "POST",
      tenantId,
      body: {
        display_name: data.display_name,
        extensao: data.extensao,
        conteudo_base64: data.conteudo_base64,
      },
      timeoutMs: 120_000,
    });
  });

export const renameAudio = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z.number().int().positive().optional(),
        audio_identifier: AudioName,
        display_name: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentFetch } = await import("./agent.server");
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{ ok: true }>(
      context,
      `/audios/${encodeURIComponent(data.audio_identifier)}`,
      {
        method: "PUT",
        tenantId,
        body: { display_name: data.display_name.trim() },
      },
    );
  });

export const deleteAudio = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ tenant_id: z.number().int().positive().optional(), audio_identifier: AudioName })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.token, data.tenant_id);
    return await authenticatedAgentFetch<{ ok: true }>(
      context,
      `/audios/${encodeURIComponent(data.audio_identifier)}`,
      {
        method: "DELETE",
        tenantId,
      },
    );
  });
