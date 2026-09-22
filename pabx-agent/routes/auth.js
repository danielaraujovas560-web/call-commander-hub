const express    = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router     = express.Router();
const pool = require("../config/db");
const requireJwt = require("../middleware/jwt");
const JWT_SECRET = process.env.JWT_SECRET;

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

module.exports = router;
