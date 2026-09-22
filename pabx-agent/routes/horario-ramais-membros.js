const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");

router.get("/horario-ramais/:regra/membros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT g.regra, r.ramal, r.endpoint_id, r.nome
         FROM ramais_grupo_horario g
         LEFT JOIN ramais r ON r.endpoint_id = g.ramal AND r.tenant_id = g.tenant_id
        WHERE g.tenant_id = ? AND g.regra = ?
        ORDER BY r.nome`,
      [tenant, req.params.regra],
    );
    res.json({ membros: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/horario-ramais/:regra/membros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const regra = req.params.regra;
  if (!regra) return res.status(400).json({ error: "Regra inválida" });

  const ramais = Array.isArray(req.body?.ramais) ? req.body.ramais : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ramais_grupo_horario WHERE tenant_id = ? AND regra = ?`, [
      tenant,
      regra,
    ]);
    for (const ramal of ramais) {
      if (!ramal) continue;
      await conn.query(
        `INSERT INTO ramais_grupo_horario (regra, tenant_id, ramal) VALUES (?, ?, ?)`,
        [regra, tenant, String(ramal)],
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

module.exports = router;
