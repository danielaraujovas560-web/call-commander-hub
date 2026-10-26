const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const { criptografarCredenciais, descriptografarCredenciais } = require("../utils/crypto.service");

function integerId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numero = Number(value);

  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function requestTenant(req) {
  const tenantId = integerId(req.tenantId);

  if (!tenantId) {
    throw httpError(401, "Tenant não identificado");
  }

  return tenantId;
}

function normalize(body, create) {
  const provider = trim(body.provider).toLowerCase();
  const remetente = trim(body.remetente);
  const waba_id = trim(body.waba_id);
  const template_nome = trim(body.template_nome);
  const template_idioma = trim(body.template_idioma) || "pt_BR";
  const nome_empresa = trim(body.nome_empresa);
  const token = trim(body.access_token);

  if (provider !== "meta") {
    throw httpError(400, "Somente o provider meta é suportado");
  }

  if (!/^\d{5,30}$/.test(remetente)) {
    throw httpError(400, "Informe um Phone Number ID numérico válido");
  }

  if (!/^\d{5,32}$/.test(waba_id)) {
    throw httpError(400, "WABA ID inválido");
  }

  if (!/^[a-zA-Z0-9_]{1,255}$/.test(template_nome)) {
    throw httpError(400, "Template inválido");
  }

  if (!/^[a-z]{2}_[A-Z]{2}$/.test(template_idioma)) {
    throw httpError(400, "Idioma inválido; exemplo: pt_BR");
  }

  if (!nome_empresa || nome_empresa.length > 150) {
    throw httpError(400, "Nome da empresa inválido");
  }

  if (create && !token) {
    throw httpError(400, "Token da Meta obrigatório para cadastrar");
  }

  if (token.length > 4096) {
    throw httpError(400, "Token muito longo");
  }

  if (typeof body.ativo !== "boolean") {
    throw httpError(400, "ativo deve ser booleano");
  }

  return {
    provider,
    remetente,
    waba_id,
    template_nome,
    template_idioma,
    nome_empresa,
    ativo: body.ativo ? 1 : 0,
    token,
  };
}

function fail(res, error) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  if (status === 500) {
    console.error("[WHATSAPP][INTEGRACOES]", error);
  }

  return res.status(status).json({
    error: status === 500 ? "Erro interno ao processar integração" : error.message,
  });
}

function publicRow(row, dids = []) {
  return {
    id: Number(row.id),
    provider: row.provider,
    remetente: row.remetente,
    waba_id: row.waba_id,
    template_nome: row.template_nome,
    template_idioma: row.template_idioma,
    nome_empresa: row.nome_empresa,
    ativo: Boolean(row.ativo),
    credencial_configurada: Boolean(row.credencial_configurada),
    dids,
    total_dids: dids.length,
  };
}

const publicFields = `
  id,
  provider,
  remetente,
  waba_id,
  template_nome,
  template_idioma,
  nome_empresa,
  ativo,
  CASE
    WHEN credenciais_enc IS NOT NULL
      AND credenciais_enc <> ''
    THEN 1
    ELSE 0
  END AS credencial_configurada
`;

router.get("/integracoes", async (req, res) => {
  try {
    const tenantId = requestTenant(req);

    const [rows] = await pool.query(
      `SELECT ${publicFields}
       FROM whatsapp_config
       WHERE tenant_id = ?
       ORDER BY id ASC`,
      [tenantId],
    );

    const [roteamentos] = await pool.query(
      `SELECT whatsapp_config_id, numero
       FROM roteamento
       WHERE tenant_id = ?
         AND whatsapp_config_id IS NOT NULL
       ORDER BY numero ASC`,
      [tenantId],
    );

    const didMap = new Map();

    for (const roteamento of roteamentos) {
      const id = Number(roteamento.whatsapp_config_id);
      const dids = didMap.get(id) || [];

      dids.push(String(roteamento.numero));
      didMap.set(id, dids);
    }

    const integracoes = rows.map((row) => publicRow(row, didMap.get(Number(row.id)) || []));

    return res.json({ integracoes });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/integracoes/:id/template", async (req, res) => {
  try {
    const tenantId = requestTenant(req);
    const id = integerId(req.params.id);

    if (!id) {
      throw httpError(400, "ID da integração inválido");
    }

    // Nunca buscar somente por ID: sempre validar o tenant.
    const [rows] = await pool.query(
      `SELECT
         id,
         waba_id,
         template_nome,
         template_idioma,
         nome_empresa,
         credenciais_enc
       FROM whatsapp_config
       WHERE id = ?
         AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId],
    );

    if (!rows.length) {
      throw httpError(404, "Integração não encontrada neste tenant");
    }

    const integracao = rows[0];

    const wabaId = String(integracao.waba_id ?? "").trim();
    const templateNome = String(integracao.template_nome ?? "").trim();
    const templateIdioma = String(integracao.template_idioma ?? "").trim();

    if (!/^\d{5,32}$/.test(wabaId)) {
      throw httpError(422, "WABA ID não configurado ou inválido nesta integração");
    }

    if (!templateNome || !templateIdioma) {
      throw httpError(422, "Nome ou idioma do template não configurado");
    }

    if (!integracao.credenciais_enc) {
      throw httpError(422, "Token da Meta não configurado");
    }

    // Reutiliza a criptografia que seu agente já utiliza.
    const credenciais = descriptografarCredenciais(integracao.credenciais_enc);

    const accessToken = credenciais.accessToken;

    if (typeof accessToken !== "string" || !accessToken.trim()) {
      throw httpError(422, "Credencial de acesso da Meta inválida");
    }

    const versao = process.env.META_GRAPH_VERSION || "v25.0";

    if (!/^v\d+\.\d+$/.test(versao)) {
      throw httpError(500, "Versão da Graph API inválida");
    }

    const url = new URL(`https://graph.facebook.com/${versao}/${wabaId}/message_templates`);

    url.searchParams.set("name", templateNome);
    url.searchParams.set("fields", "id,name,language,status,category,components");
    url.searchParams.set("limit", "100");

    // Timeout para não deixar a requisição presa.
    const respostaMeta = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    const respostaJson = await respostaMeta.json().catch(() => null);

    if (!respostaMeta.ok) {
      // Não devolve o payload bruto da Meta ao cliente.
      console.error("[WHATSAPP][TEMPLATE][META]", {
        status: respostaMeta.status,
        code: respostaJson?.error?.code,
        subcode: respostaJson?.error?.error_subcode,
      });

      if (
        respostaMeta.status === 401 ||
        respostaMeta.status === 403 ||
        respostaJson?.error?.code === 190
      ) {
        throw httpError(502, "A Meta recusou o token ou suas permissões");
      }

      throw httpError(502, "Não foi possível consultar o template na Meta");
    }

    const templates = Array.isArray(respostaJson?.data) ? respostaJson.data : [];

    // Não basta bater o nome: o idioma deve ser exato.
    const template = templates.find(
      (item) => item.name === templateNome && item.language === templateIdioma,
    );

    if (!template) {
      throw httpError(404, `Template ${templateNome} (${templateIdioma}) não encontrado na Meta`);
    }

    // Retornamos somente os campos necessários à interface.
    const components = Array.isArray(template.components)
      ? template.components.map((component) => ({
          type: component.type,
          format: component.format ?? null,
          text: component.text ?? null,
          buttons: Array.isArray(component.buttons)
            ? component.buttons.map((button) => ({
                type: button.type,
                text: button.text ?? null,
              }))
            : [],
        }))
      : [];

    return res.json({
      template: {
        id: String(template.id),
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category,
        components,
      },
      integracao: {
        id: Number(integracao.id),
        nome_empresa: integracao.nome_empresa,
      },
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      return res.status(504).json({
        error: "Tempo limite excedido ao consultar a Meta",
      });
    }

    return fail(res, error);
  }
});

router.post("/integracoes", async (req, res) => {
  try {
    const tenantId = requestTenant(req);
    const v = normalize(req.body || {}, true);

    const credenciaisEnc = criptografarCredenciais({
      accessToken: v.token,
    });

    const [result] = await pool.query(
      `INSERT INTO whatsapp_config (
        tenant_id,
        provider,
        remetente,
        waba_id,
        credenciais_enc,
        template_nome,
        template_idioma,
        nome_empresa,
        ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        v.provider,
        v.remetente,
        v.waba_id,
        credenciaisEnc,
        v.template_nome,
        v.template_idioma,
        v.nome_empresa,
        v.ativo,
      ],
    );

    const [rows] = await pool.query(
      `SELECT ${publicFields}
       FROM whatsapp_config
       WHERE tenant_id = ?
         AND id = ?`,
      [tenantId, result.insertId],
    );

    return res.status(201).json({
      integracao: publicRow(rows[0]),
    });
  } catch (error) {
    return fail(res, error);
  }
});

// ============================================================
// PUT /integracoes/:id
// Atualiza uma integração do tenant.
//
// Regra do token:
// - Campo ausente: mantém o token existente.
// - String vazia: mantém o token existente.
// - Novo token: criptografa e substitui.
// ============================================================

router.put("/integracoes/:id", async (req, res) => {
  try {
    const tenantId = requestTenant(req);
    const id = integerId(req.params.id);

    if (!id) {
      throw httpError(400, "ID inválido");
    }

    const v = normalize(req.body || {}, false);

    const credenciaisEnc = v.token
      ? criptografarCredenciais({
          accessToken: v.token,
        })
      : null;

    const [result] = await pool.query(
      `UPDATE whatsapp_config
       SET
         provider = ?,
         remetente = ?,
         template_nome = ?,
         template_idioma = ?,
         nome_empresa = ?,
         ativo = ?,
         credenciais_enc = COALESCE(?, credenciais_enc)
       WHERE id = ?
         AND tenant_id = ?`,
      [
        v.provider,
        v.remetente,
        v.template_nome,
        v.template_idioma,
        v.nome_empresa,
        v.ativo,
        credenciaisEnc,
        id,
        tenantId,
      ],
    );

    if (!result.affectedRows) {
      throw httpError(404, "Integração não encontrada neste tenant");
    }

    const [rows] = await pool.query(
      `SELECT ${publicFields}
       FROM whatsapp_config
       WHERE tenant_id = ?
         AND id = ?`,
      [tenantId, id],
    );

    const [roteamentos] = await pool.query(
      `SELECT numero
       FROM roteamento
       WHERE tenant_id = ?
         AND whatsapp_config_id = ?
       ORDER BY numero ASC`,
      [tenantId, id],
    );

    return res.json({
      integracao: publicRow(
        rows[0],
        roteamentos.map((r) => String(r.numero)),
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});

// ============================================================
// DELETE /integracoes/:id
// Exclui uma integração somente se nenhum DID estiver
// vinculado a ela.
// ============================================================

router.delete("/integracoes/:id", async (req, res) => {
  let conn;

  try {
    const tenantId = requestTenant(req);
    const id = integerId(req.params.id);

    if (!id) {
      throw httpError(400, "ID inválido");
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [integracoes] = await conn.query(
      `SELECT id
       FROM whatsapp_config
       WHERE tenant_id = ?
         AND id = ?
       FOR UPDATE`,
      [tenantId, id],
    );

    if (!integracoes.length) {
      throw httpError(404, "Integração não encontrada neste tenant");
    }

    const [vinculos] = await conn.query(
      `SELECT numero
       FROM roteamento
       WHERE tenant_id = ?
         AND whatsapp_config_id = ?
       LIMIT 1`,
      [tenantId, id],
    );

    if (vinculos.length > 0) {
      throw httpError(409, "Integração vinculada a DIDs. Desvincule os números antes de excluir.");
    }

    await conn.query(
      `DELETE FROM whatsapp_config
       WHERE id = ?
         AND tenant_id = ?`,
      [id, tenantId],
    );

    await conn.commit();

    return res.json({ ok: true });
  } catch (error) {
    if (conn) {
      await conn.rollback().catch(() => {});
    }

    return fail(res, error);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

module.exports = router;
