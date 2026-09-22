const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const requireJwt = require("../middleware/jwt");
const { getTenant } = require("../utils/tenant");

router.get("/roteamento", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT numero, tipo_destino, destino,
              descricao
         FROM roteamento
        WHERE tenant_id = ?
        ORDER BY created_at ASC`,
      [tenant],
    );
    res.json({ roteamento: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/roteamento", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { numero, tipo_destino, destino, descricao } = req.body || {};
  if (!numero || !tipo_destino || !destino) {
    return res.status(400).json({ error: "numero, tipo_destino e destino obrigatórios" });
  }
  try {
    const tipo = String(tipo_destino).toUpperCase();

    const [r] = await pool.query(
      `INSERT INTO roteamento (numero, tenant_id, tipo_destino, destino, descricao) VALUES (?, ?, ?, ?, ?)`,
      [numero, tenant, tipo, dest, descricao ?? null],
    );
    res.json({ ok: true, numero: numero });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Número já possui roteamento (edite)." });
    }
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/roteamento/:numero", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const numeroAtual = req.params.numero;
  const { numero, tipo_destino, destino, descricao } = req.body || {};
  const sets = [];
  const vals = [];
  const tipo = tipo_destino !== undefined ? String(tipo_destino).toUpperCase() : undefined;
  if (numero !== undefined && numero !== numeroAtual) {
    const [dup] = await pool.query(
      `SELECT numero
         FROM roteamento
        WHERE numero = ?
          AND tenant_id = ?`,
      [numero, tenant],
    );
    if (dup.length) {
      return res.status(409).json({ error: "O novo número já possui roteamento." });
    }
    sets.push("numero = ?");
    vals.push(numero);
  }
  if (tipo !== undefined) {
    sets.push("tipo_destino = ?");
    vals.push(tipo);
  }
  if (destino !== undefined) {
    try {
      sets.push("destino = ?");
      vals.push(destino);
    } catch (e) {
      return res.status(400).json({ error: String(e.message || e) });
    }
  }
  if (descricao !== undefined) {
    sets.push("descricao = ?");
    vals.push(descricao);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(
      `UPDATE roteamento SET ${sets.join(", ")} WHERE numero = ? AND tenant_id = ?`,
      [...vals, numeroAtual, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/roteamento/:numero", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    await pool.query(`DELETE FROM roteamento WHERE id = ? AND tenant_id = ?`, [
      Number(req.params.id),
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
