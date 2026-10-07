const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes, createHash } = require("crypto");
const { WSS_URL, SIP_PORT } = process.env;
const { gerarTokenRamal } = require("../utils/ramal-jwt");

router.post("/ramal-auth/login", async (req, res) => {
  const { endpoint_id, senha } = req.body || {};
  if (!endpoint_id || !senha)
    return res.status(400).json({ error: "endpoint_id e senha obrigatórios" });
  try {
    const [rows] = await pool.query(
      `SELECT tenant_id, ramal, nome, endpoint_id, senha FROM ramais WHERE endpoint_id = ? LIMIT 1`,
      [String(endpoint_id).trim()],
    );
    if (!rows.length || rows[0].senha !== senha) {
      return res.status(401).json({ error: "Ramal ou senha inválidos" });
    }
    const r = rows[0];

    const token = gerarTokenRamal(r);

    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO ramal_sessions (tenant_id, endpoint_id, refresh_token_hash, expires_at) VALUES(?, ?, ?, ?)`,
      [r.tenant_id, `${r.endpoint_id}-web`, refreshTokenHash, expiresAt],
    );

    res.json({
      ok: true,
      token,
      refreshToken,
      ramal: r.ramal,
      nome: r.nome,
      sip_username: `${r.endpoint_id}-web`,
      sip_password: r.senha,
      tenant_id: r.tenant_id,
      wss_url: WSS_URL,
      sip_domain: String(WSS_URL)
        .replace(/^wss?:\/\//, "")
        .split(":")[0]
        .split("/")[0],
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/ramal-auth/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) return res.status(401).json({ error: "refreshToken obrigatório" });

  try {
    // Calcula o hash do refresh token recebido
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");

    // Procura a sessão correspondente
    const [sessions] = await pool.query(
      `
        SELECT
          id,
          tenant_id,
          endpoint_id,
          expires_at,
          revoked_at
        FROM ramal_sessions
        WHERE refresh_token_hash = ?
        LIMIT 1
      `,
      [refreshTokenHash],
    );

    if (!sessions.length) return res.status(401).json({ error: "refreshToken inválido" });

    const session = sessions[0];

    // Sessão já revogada
    if (session.revoked_at) return res.status(401).json({ error: "sessão revogada" });

    // Sessão expirada
    if (new Date(session.expires_at).getTime() <= Date.now())
      return res.status(401).json({ error: "sessão expirada" });

    // Confirma que o ramal ainda existe
    const [ramais] = await pool.query(
      `
        SELECT
          tenant_id,
          ramal,
          nome,
          endpoint_id,
          senha
        FROM ramais
        WHERE tenant_id = ?
          AND endpoint_id = ?
        LIMIT 1
      `,
      [session.tenant_id, String(session.endpoint_id).replace(/-web$/, "")],
    );

    if (!ramais.length) return res.status(401).json({ error: "ramal não encontrado" });

    const r = ramais[0];

    // Gera novo JWT de acesso
    const token = gerarTokenRamal(r);

    // Gera novo refresh token
    const newRefreshToken = randomBytes(48).toString("base64url");
    const newRefreshTokenHash = createHash("sha256").update(newRefreshToken).digest("hex");

    // Nova validade: mais 8 horas
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    // Rotaciona o refresh token:
    // primeiro invalida o antigo
    await pool.query(
      `UPDATE ramal_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE id = ?`,
      [session.id],
    );

    // Depois cria a nova sessão
    await pool.query(
      `
        INSERT INTO ramal_sessions (
          tenant_id,
          endpoint_id,
          refresh_token_hash,
          expires_at
        )
        VALUES (?, ?, ?, ?)
      `,
      [r.tenant_id, `${r.endpoint_id}-web`, newRefreshTokenHash, expiresAt],
    );

    return res.json({
      ok: true,
      token,
      refreshToken: newRefreshToken,
      ramal: r.ramal,
      nome: r.nome,
      sip_username: `${r.endpoint_id}-web`,
      sip_password: r.senha,
      tenant_id: r.tenant_id,
      wss_url: WSS_URL,
      sip_domain: String(WSS_URL)
        .replace(/^wss?:\/\//, "")
        .split(":")[0]
        .split("/")[0],
    });
  } catch (e) {
    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.post("/ramal-auth/logout", async (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.json({ ok: true });
  }

  try {
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");

    await pool.query(
      `
        UPDATE ramal_sessions
        SET
          revoked_at = NOW(),
          last_used_at = NOW()
        WHERE refresh_token_hash = ?
          AND revoked_at IS NULL
      `,
      [refreshTokenHash],
    );

    return res.json({
      ok: true,
    });
  } catch (e) {
    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.get("/config/sip", (req, res) => {
  const host = String(WSS_URL)
    .replace(/^wss?:\/\//, "")
    .split(":")[0]
    .split("/")[0];
  res.json({ host, port: SIP_PORT });
});

module.exports = router;
