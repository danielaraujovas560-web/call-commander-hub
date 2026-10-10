const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.post("/uras/:ura_identifier/opcoes", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;

  const {
    chave,
    descricao,
    tipo_destino,
    destino,
  } = req.body || {};

  if (!chave || !tipo_destino || !destino) {
    return res.status(400).json({
      error: "chave, tipo_destino e destino obrigatórios",
    });
  }

  try {
    const [own] = await pool.query(
      `SELECT ura_identifier
       FROM uras
       WHERE ura_identifier = ?
         AND tenant_id = ?`,
      [uraIdentifier, tenant],
    );

    if (!own.length) {
      return res.status(404).json({
        error: "URA não encontrada",
      });
    }

    const chaveValor = String(chave).trim();

    const [r] = await pool.query(
      `INSERT INTO ura_opcoes (
          ura_identifier,
          chave,
          descricao,
          tipo_destino,
          destino
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        uraIdentifier,
        chaveValor,
        descricao != null ? String(descricao).trim() : null,
        String(tipo_destino).toUpperCase(),
        String(destino),
      ],
    );

    res.json({
      ok: true,
      id: r.insertId,
      ura_identifier: uraIdentifier,
      chave: chaveValor,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.put("/uras/:ura_identifier/opcoes/:id", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "ID da opção inválido",
    });
  }

  const {
    chave,
    descricao,
    tipo_destino,
    destino,
  } = req.body || {};

  const sets = [];
  const vals = [];

  if (chave !== undefined) {
    sets.push("chave = ?");
    vals.push(String(chave).trim());
  }

  if (descricao !== undefined) {
    sets.push("descricao = ?");
    vals.push(
      descricao != null
        ? String(descricao).trim()
        : null,
    );
  }

  if (tipo_destino !== undefined) {
    sets.push("tipo_destino = ?");
    vals.push(String(tipo_destino).toUpperCase());
  }

  if (destino !== undefined) {
    sets.push("destino = ?");
    vals.push(String(destino));
  }

  if (!sets.length) {
    return res.json({ ok: true });
  }

  try {
    const [result] = await pool.query(
      `UPDATE ura_opcoes o
       INNER JOIN uras u
         ON u.ura_identifier = o.ura_identifier
       SET ${sets.join(", ")}
       WHERE o.id = ?
         AND o.ura_identifier = ?
         AND u.tenant_id = ?`,
      [...vals, id, uraIdentifier, tenant],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Opção da URA não encontrada",
      });
    }

    res.json({
      ok: true,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.delete("/uras/:ura_identifier/opcoes/:id", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "ID da opção inválido",
    });
  }

  try {
    const [result] = await pool.query(
      `DELETE o
       FROM ura_opcoes o
       INNER JOIN uras u
         ON u.ura_identifier = o.ura_identifier
       WHERE o.id = ?
         AND o.ura_identifier = ?
         AND u.tenant_id = ?`,
      [id, uraIdentifier, tenant],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Opção da URA não encontrada",
      });
    }

    res.json({
      ok: true,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
