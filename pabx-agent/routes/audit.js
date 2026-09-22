const express    = require("express");
const router     = express.Router();
const { randomUUID } = require("crypto");
const pool       = require("../config/db");
const requireJwt = require("../middleware/jwt");

router.post("/audit-log", requireJwt, async (req, res) => {
  const { tenant_id, action, payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "action obrigatório" });
  try {
    await pool.query(
      "INSERT INTO audit_log (id, user_id, tenant_id, action, payload) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), req.userId, tenant_id ?? null, String(action), payload ? JSON.stringify(payload) : null],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
