const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");

router.post("/uras/:ura_identifier/opcoes", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  const { digito, tipo_destino, destino } = req.body || {};
  if (!tipo_destino || !destino)
    return res.status(400).json({ error: "tipo_destino e destino obrigatórios" });
  try {
    const [own] = await pool.query(
      `SELECT ura_identifier FROM uras WHERE ura_identifier = ? AND tenant_id = ?`,
      [uraIdentifier, tenant],
    );
    if (!own.length) return res.status(404).json({ error: "URA não encontrada" });
    const digitoValor = String(digito ?? "");
    const [r] = await pool.query(
      `INSERT INTO ura_opcoes (ura_identifier, digito, tipo_destino, destino) VALUES (?, ?, ?, ?)`,
      [uraIdentifier, digitoValor, String(tipo_destino).toUpperCase(), String(destino)],
    );
    res.json({ ok: true, ura_identifier: uraIdentifier, digito: digitoValor });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/uras/:ura_identifier/opcoes/:opcao", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  const oldDigito = req.params.opcao;
  const { digito, tipo_destino, destino } = req.body || {};
  const sets = [];
  const vals = [];
  if (digito !== undefined) {
    sets.push("digito = ?");
    vals.push(String(digito));
  }
  if (tipo_destino !== undefined) {
    sets.push("tipo_destino = ?");
    vals.push(String(tipo_destino).toUpperCase());
  }
  if (destino !== undefined) {
    sets.push("destino = ?");
    vals.push(String(destino));
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(
      `UPDATE ura_opcoes o JOIN uras u ON u.ura_identifier = o.ura_identifier
          SET ${sets.join(", ")}
        WHERE o.ura_identifier = ? AND o.digito = ? AND u.tenant_id = ?`,
      [...vals, uraIdentifier, oldDigito, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/uras/:ura_identifier/opcoes/:opcao", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  const digito = req.params.opcao;
  try {
    await pool.query(
      `DELETE o FROM ura_opcoes o JOIN uras u ON u.ura_identifier = o.ura_identifier
        WHERE o.ura_identifier = ? AND o.digito = ? AND u.tenant_id = ?`,
      [uraIdentifier, digito, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
