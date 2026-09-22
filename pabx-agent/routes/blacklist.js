const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");

router.get("/blacklist", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT regra, tipo, destino, ativo, motivo, data_hora_desbloqueio
         FROM blacklist WHERE tenant_id = ? ORDER BY created_at ASC`,
      [tenant],
    );
    res.json({ blacklist: rows.map((r) => ({ ...r, ativo: !!r.ativo })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/blacklist", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { regra, tipo, destino, motivo, data_hora_desbloqueio } = req.body || {};
  if (!regra || !tipo || !destino || !data_hora_desbloqueio) {
    return res
      .status(400)
      .json({ error: "regra, tipo, destino e data_hora_desbloqueio obrigatórios" });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO blacklist (tenant_id, regra, tipo, destino, ativo, motivo, data_hora_desbloqueio)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [tenant, regra, tipo, destino, motivo || null, data_hora_desbloqueio],
    );
    res.json({ ok: true, destino: r.destino });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/blacklist/:destino/:regra/:tipo", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const destinoAtual = req.params.destino;
  const regraAtual = req.params.regra;
  const tipoAtual = req.params.tipo;
  if (!destinoAtual || !regraAtual || !tipoAtual)
    return res.status(400).json({ error: "regra, tipo, destino obrigatórios" });
  const { regra, tipo, destino, motivo, data_hora_desbloqueio, ativo } = req.body || {};
  try {
    const [b] = await pool.query(
      `SELECT * FROM blacklist
       WHERE destino = ? AND tenant_id = ? AND regra = ? AND tipo = ?`,
      [destinoAtual, tenant, regraAtual, tipoAtual],
    );

    if (!b.length) return res.status(404).json({ error: "Regra de blacklist não encontrada." });

    const sets = [];
    const vals = [];

    if (regra !== undefined) {
      sets.push("regra = ?");
      vals.push(regra);
    }
    if (tipo !== undefined) {
      sets.push("tipo = ?");
      vals.push(tipo);
    }
    if (destino !== undefined) {
      sets.push("destino = ?");
      vals.push(destino);
    }
    if (motivo !== undefined) {
      sets.push("motivo = ?");
      vals.push(motivo);
    }
    if (data_hora_desbloqueio !== undefined) {
      sets.push("data_hora_desbloqueio = ?");
      vals.push(data_hora_desbloqueio);
    }
    if (ativo !== undefined) {
      sets.push("ativo = ?");
      vals.push(ativo);
    }
    if (!sets.length) {
      return res.json({ ok: true });
    }

    await pool.query(
      `UPDATE blacklist
        SET ${sets.join(", ")}
      WHERE destino = ?
        AND tenant_id = ?
        AND regra = ?
        AND tipo = ?`,
      [...vals, destinoAtual, tenant, regraAtual, tipoAtual],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/blacklist/:destino/:regra/:tipo", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const destino = req.params.destino;
  const regra = req.params.regra;
  const tipo = req.params.tipo;
  try {
    await pool.query(
      `DELETE FROM blacklist WHERE destino = ? AND tenant_id = ? AND regra = ? AND tipo = ?`,
      [destino, tenant, regra, tipo],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
