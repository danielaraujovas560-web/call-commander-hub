const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");

router.get("/horario-ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [regras] = await pool.query(
      `SELECT regra, nome, dias, hora_inicial, hora_final
         FROM regra_horario_ramais WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    // count members
    for (const r of regras) {
      const [[c]] = await pool.query(
        `SELECT COUNT(*) AS n FROM ramais_grupo_horario WHERE tenant_id = ? AND regra = ?`,
        [tenant, r.regra],
      );
      r.membros = Number(c.n) || 0;
    }
    res.json({ regras });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

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

router.post("/horario-ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, dias, hora_inicial, hora_final } = req.body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return res.status(400).json({ error: "nome, dias, hora_inicial e hora_final obrigatórios" });
  const b = req.body;
  const ramais = Array.isArray(b.ramais) ? b.ramais : [];
  const slug = slugName(String(b.nome));
  if (!slug) return res.status(400).json({ error: "Nome da regra inválida" });
  const regraHoraRamalName = `r${tenant}-${slug}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO regra_horario_ramais (regra, tenant_id, nome, dias, hora_inicial, hora_final)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        regraHoraRamalName,
        tenant,
        b.nome,
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
      ],
    );
    for (const ramal of ramais) {
      if (!ramal) continue;
      await conn.query(
        `INSERT INTO ramais_grupo_horario (regra, tenant_id, ramal) VALUES (?, ?, ?)`,
        [regraHoraRamalName, tenant, String(ramal)],
      );
    }
    await conn.commit();
    res.json({ ok: true, regra: regraHoraRamalName });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/horario-ramais/:regra", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, dias, hora_inicial, hora_final } = req.body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return res.status(400).json({ error: "nome, dias, hora_inicial e hora_final obrigatórios" });
  const b = req.body;
  const regra = req.params.regra;
  const slug = slugName(String(b.nome));
  if (!slug) return res.status(400).json({ error: "Nome da regra inválida" });
  const regraHoraRamalName = `r${tenant}-${slug}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE regra_horario_ramais
         SET regra=?, nome=?, dias=?, hora_inicial=?, hora_final=?
       WHERE regra = ? AND tenant_id = ?`,
      [
        regraHoraRamalName,
        b.nome,
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        regra,
        tenant,
      ],
    );
    await conn.query(
      `UPDATE ramais_grupo_horario SET regra = ? WHERE tenant_id = ? AND regra = ?`,
      [regraHoraRamalName, tenant, regra],
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

router.delete("/horario-ramais/:regra", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const regra = req.params.regra;
    await pool.query(`DELETE FROM ramais_grupo_horario WHERE tenant_id = ? AND regra = ?`, [
      tenant,
      regra,
    ]);
    await pool.query(`DELETE FROM regra_horario_ramais WHERE regra = ? AND tenant_id = ?`, [
      regra,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
