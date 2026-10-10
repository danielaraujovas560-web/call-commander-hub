import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveTenantId } from "./tenant.server";
import { authenticatedAgentFetch } from "./agent.server";

export interface UraOpcao {
  id: number;
  ura_identifier: string;
  chave: string;
  descricao: string | null;
  tipo_destino: string;
  destino: string;
}

export interface Ura {
  ura_identifier: string;
  nome: string;
  tipo: "Normal" | "IA";
  ia_id: string | null;
  saudacao_ia: string | null;
  audio: string | null;
  max_digits: number | null;
  tentativas: number | null;
  timeout: number | null;
  ativo: boolean;
  opcoes: UraOpcao[];
}

const UraInput = z
  .object({
    tenant_id: z.number().int().positive().optional(),

    nome: z
      .string()
      .trim()
      .min(1)
      .max(100),

    tipo: z.enum(["Normal", "IA"]),

    ia_id: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .optional(),

    saudacao_ia: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional(),

    audio: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional(),

    max_digits: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    tentativas: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    timeout: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    ativo: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "IA") {
      if (!data.ia_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ia_id"],
          message: "IA é obrigatória",
        });
      }

      if (!data.saudacao_ia) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["saudacao_ia"],
          message: "Saudação da IA é obrigatória",
        });
      }
    }

    if (data.tipo === "Normal") {
      if (!data.audio) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audio"],
          message: "Áudio é obrigatório",
        });
      }

      if (data.max_digits == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["max_digits"],
          message: "Máximo de dígitos é obrigatório",
        });
      }

      if (data.tentativas == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tentativas"],
          message: "Tentativas são obrigatórias",
        });
      }

      if (data.timeout == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["timeout"],
          message: "Timeout é obrigatório",
        });
      }
    }
  });

const UraUpdateInput = z.object({
  tenant_id: z.number().int().positive().optional(),

  ura_identifier: z.string().min(1),

  nome: z.string().trim().min(1).max(100).optional(),

  tipo: z.enum(["Normal", "IA"]).optional(),

  ia_id: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),

  saudacao_ia: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),

  audio: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),

  max_digits: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  tentativas: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  timeout: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  ativo: z.boolean().optional(),
});

export const listUras = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const res = await authenticatedAgentFetch<{
      uras: Ura[];
    }>(
      context,
      `/uras?tenant=${tenantId}`,
      { tenantId },
    );

    return {
      tenantId,
      uras: res.uras ?? [],
    };
  });

export const listUraDestinos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    return await authenticatedAgentFetch<{
      filas: { value: string; label: string }[];
      uras: { value: string; label: string }[];
      ramais: { value: string; label: string }[];
      troncos: { value: string; label: string }[];
      regras: { value: string; label: string }[];
      audios: { value: string; label: string }[];
    }>(
      context,
      `/uras/destinos`,
      { tenantId },
    );
  });

export const createUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => UraInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const {
      tenant_id: _i,
      ...body
    } = data;

    return await authenticatedAgentFetch<{
      ok: true;
      ura_identifier: string;
    }>(
      context,
      "/uras",
      {
        method: "POST",
        tenantId,
        body,
      },
    );
  });

export const updateUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => UraUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const {
      ura_identifier,
      tenant_id: _i,
      ...patch
    } = data;

    return await authenticatedAgentFetch<{
      ok: true;
      ura_identifier?: string;
    }>(
      context,
      `/uras/${encodeURIComponent(ura_identifier)}`,
      {
        method: "PUT",
        tenantId,
        body: patch,
      },
    );
  });

export const deleteUra = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),
        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    await authenticatedAgentFetch(
      context,
      `/uras/${encodeURIComponent(data.ura_identifier)}`,
      {
        method: "DELETE",
        tenantId,
      },
    );

    return {
      ok: true,
    };
  });

export const addUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),

        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),

        chave: z
          .coerce
          .string()
          .trim()
          .min(1)
          .max(100),

        descricao: z
          .coerce
          .string()
          .trim()
          .max(255)
          .optional()
          .nullable(),

        tipo_destino: z.enum([
          "FILA",
          "URA",
          "RAMAL",
          "INTERNO",
          "EXTERNO",
          "AUDIO",
        ]),

        destino: z
          .coerce
          .string()
          .trim()
          .min(1)
          .max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const {
      ura_identifier,
      tenant_id: _i,
      ...body
    } = data;

    return await authenticatedAgentFetch<{
      ok: true;
      id: number;
      ura_identifier: string;
      chave: string;
    }>(
      context,
      `/uras/${encodeURIComponent(ura_identifier)}/opcoes`,
      {
        method: "POST",
        tenantId,
        body,
      },
    );
  });

export const updateUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),

        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),

        id: z
          .number()
          .int()
          .positive(),

        chave: z
          .coerce
          .string()
          .trim()
          .min(1)
          .max(100)
          .optional(),

        descricao: z
          .coerce
          .string()
          .trim()
          .max(255)
          .optional()
          .nullable(),

        tipo_destino: z
          .enum([
            "FILA",
            "URA",
            "RAMAL",
            "INTERNO",
            "EXTERNO",
            "AUDIO",
          ])
          .optional(),

        destino: z
          .coerce
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    const {
      ura_identifier,
      id,
      tenant_id: _i,
      ...body
    } = data;

    return await authenticatedAgentFetch<{
      ok: true;
    }>(
      context,
      `/uras/${encodeURIComponent(ura_identifier)}/opcoes/${id}`,
      {
        method: "PUT",
        tenantId,
        body,
      },
    );
  });

export const deleteUraOpcao = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1),

        id: z
          .number()
          .int()
          .positive(),

        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    await authenticatedAgentFetch(
      context,
      `/uras/${encodeURIComponent(data.ura_identifier)}/opcoes/${data.id}`,
      {
        method: "DELETE",
        tenantId,
      },
    );

    return {
      ok: true,
    };
  });

export const toggleUraAtivo = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ura_identifier: z.string().min(1).max(64),
        tenant_id: z
          .number()
          .int()
          .positive()
          .optional(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(
      context.token,
      data.tenant_id,
    );

    await authenticatedAgentFetch(
      context,
      `/uras/${encodeURIComponent(data.ura_identifier)}/ativo`,
      {
        method: "PUT",
        tenantId,
        body: {
          ativo: data.ativo,
        },
      },
    );

    return {
      ok: true,
    };
  });
