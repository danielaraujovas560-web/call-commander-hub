const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../config/db");
const requireJwt = require("../middleware/jwt");
const { JWT_SECRET, WSS_URL, SIP_PORT } = process.env;

router.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: "email e senha obrigatórios" });
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, email, senha_hash FROM profiles WHERE email = ? LIMIT 1",
      [email],
    );
    if (!rows.length) return res.status(401).json({ error: "credenciais inválidas" });
    const u = rows[0];
    const ok = await bcrypt.compare(senha, u.senha_hash);
    if (!ok) return res.status(401).json({ error: "credenciais inválidas" });

    const [[roleRow]] = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role LIMIT 1",
      [u.id],
    );
    const role = roleRow?.role || "cliente";
    const token = jwt.sign({ sub: u.id, role }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, role } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/auth/me", requireJwt, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nome, email FROM profiles WHERE id = ?", [
      req.userId,
    ]);
    if (!rows.length) return res.status(404).json({ error: "usuário não encontrado" });
    res.json({ user: { ...rows[0], role: req.role }, role: req.role });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
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

router.get("/config/sip", (req, res) => {
  const host = String(WSS_URL)
    .replace(/^wss?:\/\//, "")
    .split(":")[0]
    .split("/")[0];
  res.json({ host, port: SIP_PORT });
});

module.exports = router;
