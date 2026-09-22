const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { bloquearIp, liberarIp } = require("../firewall");

router.get("/firewall", async (req, res) => {
  try {
    const [firewall] = await pool.query(`SELECT * FROM firewall_ips`);
    res.json({ firewall });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/firewall", async (req, res) => {
  const { ip, tipo, motivo, expires_at } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [firewall] = await conn.query(
      `INSERT INTO firewall_ips (ip, tipo, motivo, expires_at) VALUES (?, ?, ?, ?)`,
      [ip, tipo, motivo, expires_at],
    );
    await conn.commit();
    if (tipo === "BLACKLIST") {
      await bloquearIp(ip);
    }
    res.json({ ok: true, id: firewall.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.delete("/firewall/:id", async (req, res) => {
  const id = req.params.id;
  const { ip, tipo } = req.body || {};
  try {
    const [firewall] = await pool.query(`DELETE FROM firewall_ips WHERE id = ?`, [id]);

    if (tipo === "BLACKLIST") {
      await liberarIp(ip);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
