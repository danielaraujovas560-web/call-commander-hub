const express = require("express");
const crypto = require("node:crypto");

const router = express.Router();

const { publicar } = require("../ramal-monitor");
const db = require("../config/db");

const { descriptografarCredenciais } = require("../utils/crypto.service");

const { enviarTemplateMeta } = require("../providers/meta");

const { sendIncomingCallToRamal } = require("./mobilePush");

const conferenciaAmi = require("../services/conferenciaAmi");

function internalOnly(req, res, next) {
  const recebida = Buffer.from(req.get("X-Internal-Key") || "");
  const esperada = Buffer.from(process.env.INTERNAL_KEY || "");

  const ok =
    esperada.length > 0 &&
    recebida.length === esperada.length &&
    crypto.timingSafeEqual(recebida, esperada);

  if (!ok) {
    return res.status(403).json({
      error: "Acesso restrito",
    });
  }

  next();
}

router.post("/api/internal/cdr-updated", internalOnly, (req, res) => {
  const { tenantId, endpointIds } = req.body;

  if (tenantId) {
    publicar(String(tenantId), "CDR_UPDATED", {
      endpointIds: Array.isArray(endpointIds) ? endpointIds.map(String) : [],
    });
  }

  return res.json({ ok: true });
});

router.post("/api/internal/web-hook-whatsapp", internalOnly, async (req, res) => {
  try {
    const { tenantId, callId, from, to } = req.body || {};

    const tenant = Number(tenantId);

    if (!Number.isSafeInteger(tenant) || tenant <= 0 || !callId || !from || !to) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetros inválidos",
      });
    }

    // Busca a integração associada ao DID.
    const [integracoes] = await db.execute(
      `
  SELECT
    wc.id,
    wc.provider,
    wc.remetente,
    wc.credenciais_enc,
    wc.template_nome,
    wc.template_idioma,
    wc.nome_empresa
  FROM whatsapp_config wc
  INNER JOIN roteamento r
    ON r.whatsapp_config_id = wc.id
    AND r.tenant_id = wc.tenant_id
  WHERE r.numero = ?
    AND r.tenant_id = ?
    AND wc.ativo = 1
        LIMIT 1
        `,
      [String(to), tenant],
    );

    if (integracoes.length === 0) {
      return res.json({
        ok: true,
        enviado: false,
        motivo: "Nenhuma integração habilitada para este DID",
      });
    }

    const integracao = integracoes[0];

    if (integracao.provider !== "meta") {
      return res.status(422).json({
        ok: false,
        error: "Provedor ainda não implementado",
      });
    }

    // As credenciais precisam estar criptografadas
    // no formato utilizado pelo crypto.service.js.
    const credenciais = descriptografarCredenciais(integracao.credenciais_enc);

    const resultado = await enviarTemplateMeta({
      phoneNumberId: integracao.remetente,
      accessToken: credenciais.accessToken,
      destinatario: from,
      templateNome: integracao.template_nome,
      templateIdioma: integracao.template_idioma,
      parametros: [integracao.nome_empresa],
    });

    console.log("[WHATSAPP][META][SOLICITADO]", {
      tenantId: tenant,
      callId,
      integracaoId: integracao.id,
      messageId: resultado.messageId,
    });

    return res.json({
      ok: true,
      enviado: true,
      messageId: resultado.messageId,
    });
  } catch (erro) {
    console.error("[WHATSAPP][FALLBACK][ERRO]", {
      message: erro.message,
      status: erro.response?.status,
      providerError: erro.response?.data?.error?.code,
    });

    return res.status(500).json({
      ok: false,
      error: "Erro ao processar fallback WhatsApp",
    });
  }
});

router.post("/api/internal/mobile-push/test-call", internalOnly, async (req, res) => {
  try {
    const { tenantId, ramal, callId, caller, callerName, callerNumber } = req.body || {};

    if (
      !Number.isSafeInteger(Number(tenantId)) ||
      Number(tenantId) <= 0 ||
      !/^\d{1,20}$/.test(String(ramal || "")) ||
      !callId
    ) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
      });
    }

    const results = await sendIncomingCallToRamal({
      pool: db,
      tenantId: Number(tenantId),
      ramal,
      callId,
      caller,
      callerName,
      callerNumber,
    });

    return res.json({ ok: true, results });
  } catch (err) {
    console.error("[FCM] Erro:", err);
    return res.status(500).json({
      error: "Falha no envio FCM",
    });
  }
});

router.post("/api/internal/conferencias/convidar", internalOnly, async (req, res) => {
    try {
        const { tenantId, conferenciaId, endpoint } = req.body || {};

        const tenant = Number(tenantId);
        const id = Number(conferenciaId);
        const destino = String(endpoint || "").trim();

        if (
            !Number.isSafeInteger(tenant) ||
            tenant <= 0 ||
            !Number.isSafeInteger(id) ||
            id <= 0 ||
            !/^\d{1,20}(?:-(?:web|mobile))?$/.test(destino)
        ) {
            return res.status(400).json({
                ok: false,
                error: "Parâmetros inválidos"
            });
        }

        // Busca a conferência pertencente ao tenant
        const [rows] = await db.execute(`
            SELECT
                id,
                tenant_id,
                nome,
                ramal,
                tipo,
                ativo,
                max_participantes,
                gravar,
                mixing_interval
            FROM conferencias
            WHERE id = ?
              AND tenant_id = ?
              AND tipo = 'INTERNA'
              AND ativo = 1
            LIMIT 1
        `, [id, tenant]);

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                error: "Conferência não encontrada"
            });
        }

        const conferencia = rows[0];

        // Teste interno controlado:
        // antes de produção, validar que o endpoint pertence ao tenant
        // e que o solicitante tem permissão de convidá-lo.

        const resultado = await conferenciaAmi.convidarRamal({
            tenantId: tenant,
            conferencia,
            endpoint: destino
        });

        console.log("[CONFERENCIA][CONVITE]", {
            tenantId: tenant,
            conferenciaId: id,
            endpoint: destino,
            actionId: resultado.actionId
        });

        return res.status(202).json({
            ok: true,
            ...resultado
        });

    } catch (err) {
        console.error("[CONFERENCIA][ERRO]", err);

        return res.status(500).json({
            ok: false,
            error: "Falha ao solicitar convite"
        });
    }
});

require("./conferencia-internal.routes")(router, internalOnly);

module.exports = router;
