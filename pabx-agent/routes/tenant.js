const express    = require("express");
const router     = express.Router();
const pool       = require("../config/db");
const requireJwt = require("../middleware/jwt");
const { resolveTenantId } = require("../utils/tenant");

router.get("/tenant/resolve", requireJwt, async (req, res) => {
  try {
    const override = req.query.tenant_id != null ? Number(req.query.tenant_id) : undefined;
    const tenantId = await resolveTenantId(req.userId, req.role, override);
    res.json({ tenant_id: tenantId });
  } catch (e) {
    res.status(403).json({ error: String(e.message || e) });
  }
});

router.get("/my/tenants", requireJwt, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tenant_id, label, is_default FROM tenants_link
       WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 10`,
      [req.userId],
    );
    res.json({ tenants: rows.map((r) => ({ ...r, is_default: !!r.is_default })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/tenants", async (req, res) => {
  const { id, nome } = req.body || {};
  if (!id || !nome) return res.status(400).json({ error: "id e nome obrigatórios" });
  try {
    await pool.query(
      `INSERT INTO tenants (id, nome) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [Number(id), String(nome).slice(0, 50)],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/tenants", async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, nome FROM tenants ORDER BY id`);
    res.json({ tenants: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
