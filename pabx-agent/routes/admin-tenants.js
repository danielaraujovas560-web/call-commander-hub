const express        = require("express");
const router         = express.Router();
const { randomUUID } = require("crypto");
const pool           = require("../config/db");
const requireJwt     = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");

router.get("/admin/tenants", requireJwt, requireAdmin, async (req, res) => {
  try {
     const [rows] = await pool.query(`SELECT c.tenant_id, c.razao_social FROM clientes c JOIN tenants t ON c.tenant_id = t.id`)
    res.json({ ok: true, tenants: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/admin/tenant-links", requireJwt, requireAdmin, async (req, res) => {
  const { user_id, tenant_id, label, is_default } = req.body || {};
  if (!user_id || !tenant_id)
    return res.status(400).json({ error: "user_id e tenant_id obrigatórios" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (is_default) {
      await conn.query("UPDATE tenants_link SET is_default = 0 WHERE user_id = ?", [user_id]);
    }
    await conn.query(
      "INSERT INTO tenants_link (id, user_id, tenant_id, label, is_default) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), user_id, Number(tenant_id), label || null, is_default ? 1 : 0],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.delete("/admin/tenant-links", requireJwt, requireAdmin, async (req, res) => {
  const { user_id, tenant_id } = req.body || {};
  if (!user_id || !tenant_id)
    return res.status(400).json({ error: "user_id e tenant_id obrigatórios" });
  try {
    await pool.query("DELETE FROM tenants_link WHERE user_id = ? AND tenant_id = ?", [
      user_id,
      Number(tenant_id),
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
