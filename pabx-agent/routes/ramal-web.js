const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { JWT_SECRET, WSS_URL, SIP_PORT } = process.env;
const requireJwt = require("../middleware/jwt");
const { resolveTenantId } = require("../utils/tenant");

router.get("/ws/ramais/token", requireJwt, async (req, res) => {
  try {
    const tenantId = await resolveTenantId(req.userId, req.role);

    const ticket = jwt.sign(
      {
        sub: req.userId,
        role: req.role,
        tenant_id: tenantId,
        type: "ramal_ws",
      },
      JWT_SECRET,
      {
        expiresIn: "60s",
      },
    );

    res.json({ ticket });
  } catch (e) {
    res.status(403).json({
      error: String(e.message || e),
    });
  }
});

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
    res.json({
      ok: true,
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

// Dados de conexão SIP padrão (softphone comum — Zoiper, Grandstream, etc),
// não confundir com o WSS do painel WebRTC. Porta fixa configurável via env.
router.get("/config/sip", (req, res) => {
  const host = String(WSS_URL)
    .replace(/^wss?:\/\//, "")
    .split(":")[0]
    .split("/")[0];
  res.json({ host, port: SIP_PORT });
});

module.exports = router;
