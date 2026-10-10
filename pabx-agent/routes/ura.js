const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const fs = require("fs/promises");
const path = require("path");
const slugName = require("../utils/slug");

const { SOUNDS_BASE = "/var/lib/asterisk/sounds/" } = process.env;

router.get("/uras", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  try {
    const [rows] = await pool.query(
      `SELECT
          u.ura_identifier,
          u.nome,
          u.tipo,
          u.ia_id,
          u.saudacao_ia,
          u.audio,
          a.display_name,
          u.max_digits,
          u.tentativas,
          u.timeout,
          u.ativo
       FROM uras u
       LEFT JOIN audios a
         ON u.tenant_id = a.tenant_id
        AND u.audio = a.audio_identifier
       WHERE u.tenant_id = ?
       ORDER BY u.created_at ASC`,
      [tenant],
    );

    const uras = rows.map((r) => ({
      ...r,
      ativo: !!r.ativo,
    }));

    for (const u of uras) {
      const [opts] = await pool.query(
        `SELECT
            id,
            ura_identifier,
            chave,
            descricao,
            tipo_destino,
            destino
         FROM ura_opcoes
         WHERE ura_identifier = ?
         ORDER BY id`,
        [u.ura_identifier],
      );

      u.opcoes = opts.map((o) => ({
        ...o,
        tipo_destino: String(o.tipo_destino || "").toUpperCase(),
      }));
    }

    res.json({ uras });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.get("/uras/destinos", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  try {
    const [filas] = await pool.query(
      `SELECT
          name AS value,
          display_name AS label
       FROM filas
       WHERE tenant_id = ?
       ORDER BY display_name`,
      [String(tenant)],
    );

    const [uras] = await pool.query(
      `SELECT
          ura_identifier AS value,
          nome AS label
       FROM uras
       WHERE tenant_id = ?
       ORDER BY nome`,
      [tenant],
    );

    const [ramais] = await pool.query(
      `SELECT
          endpoint_id AS value,
          nome AS label,
          ramal
       FROM ramais
       WHERE tenant_id = ?
       ORDER BY endpoint_id`,
      [tenant],
    );

    const [troncos] = await pool.query(
      `SELECT
          tronco_pjsip AS value,
          nome AS label
       FROM troncos
       WHERE tenant_id = ?
       ORDER BY nome`,
      [tenant],
    );

    const [regras] = await pool.query(
      `SELECT
          regra_identifier AS value,
          nome AS label
       FROM regra_horario
       WHERE tenant_id = ?
       ORDER BY nome`,
      [tenant],
    );

    const [audios] = await pool.query(
      `SELECT
          audio_identifier AS value,
          display_name AS label
       FROM audios
       WHERE tenant_id = ?
         AND (tipo = 'normal' OR tipo IS NULL)
       ORDER BY display_name ASC`,
      [tenant],
    );

    res.json({
      filas,
      uras,
      ramais,
      troncos,
      regras,
      audios,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.post("/uras", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  const {
    nome,
    tipo,
    ia_id,
    saudacao_ia,
    audio,
    max_digits,
    tentativas,
    timeout,
    ativo,
  } = req.body || {};

  if (!nome) {
    return res.status(400).json({
      error: "O nome da URA é obrigatório",
    });
  }

  if (!tipo) {
    return res.status(400).json({
      error: "O tipo da URA é obrigatório",
    });
  }

  if (!["Normal", "IA"].includes(tipo)) {
    return res.status(400).json({
      error: "O tipo da URA deve ser Normal ou IA",
    });
  }

  if (tipo === "IA") {
    if (!ia_id || !saudacao_ia) {
      return res.status(400).json({
        error: "ia_id e saudacao_ia da URA são obrigatórios",
      });
    }
  } else {
    if (!audio || max_digits == null || tentativas == null || timeout == null) {
      return res.status(400).json({
        error: "audio, max_digits, tentativas e timeout da URA são obrigatórios",
      });
    }
  }

  const slug = slugName(nome);
  const uraIdentifier = `u${tenant}-${slug}`;

  try {
    const [dup] = await pool.query(
      `SELECT ura_identifier
       FROM uras
       WHERE tenant_id = ?
         AND nome = ?
       LIMIT 1`,
      [tenant, nome],
    );

    if (dup.length) {
      return res.status(409).json({
        error: "Já existe uma URA com esse nome neste tenant",
      });
    }

    const [r] = await pool.query(
      `INSERT INTO uras (
          ura_identifier,
          tenant_id,
          nome,
          tipo,
          ia_id,
          saudacao_ia,
          audio,
          max_digits,
          tentativas,
          timeout,
          ativo
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uraIdentifier,
        tenant,
        nome,
        tipo,
        tipo === "IA" ? ia_id : null,
        tipo === "IA" ? saudacao_ia : null,
        tipo === "Normal" ? audio : null,
        tipo === "Normal" ? Number(max_digits) : null,
        tipo === "Normal" ? Number(tentativas) : null,
        tipo === "Normal" ? Number(timeout) : null,
        ativo ? 1 : 0,
      ],
    );

    res.json({
      ok: true,
      ura_identifier: r.ura_identifier,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.put("/uras/:ura_identifier", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;

  const {
    nome,
    tipo,
    ia_id,
    saudacao_ia,
    audio,
    max_digits,
    tentativas,
    timeout,
    ativo,
  } = req.body || {};

  try {
    const [current] = await pool.query(
      `SELECT
          nome,
          tipo,
          ia_id,
          saudacao_ia,
          audio,
          max_digits,
          tentativas,
          timeout,
          ativo
       FROM uras
       WHERE tenant_id = ?
         AND ura_identifier = ?
       LIMIT 1`,
      [tenant, uraIdentifier],
    );

    if (!current.length) {
      return res.status(404).json({
        error: "URA não encontrada",
      });
    }

    const atual = current[0];

    const nomeNovo = nome ?? atual.nome;
    const tipoNovo = tipo ?? atual.tipo;

    if (!["Normal", "IA"].includes(tipoNovo)) {
      return res.status(400).json({
        error: "O tipo da URA deve ser Normal ou IA",
      });
    }

    /*
     * Validação conforme o tipo da URA
     */
    if (tipoNovo === "IA") {
      const iaNovo = ia_id ?? atual.ia_id;
      const saudacaoNova = saudacao_ia ?? atual.saudacao_ia;

      if (!iaNovo || !saudacaoNova) {
        return res.status(400).json({
          error: "ia_id e saudacao_ia da URA são obrigatórios",
        });
      }
    } else {
      const audioNovo = audio ?? atual.audio;
      const maxDigitsNovo = max_digits ?? atual.max_digits;
      const tentativasNova = tentativas ?? atual.tentativas;
      const timeoutNovo = timeout ?? atual.timeout;

      if (
        !audioNovo ||
        maxDigitsNovo == null ||
        tentativasNova == null ||
        timeoutNovo == null
      ) {
        return res.status(400).json({
          error:
            "audio, max_digits, tentativas e timeout da URA são obrigatórios",
        });
      }
    }

    /*
     * Verifica mudança de nome
     */
    const nomeMudou = nomeNovo !== atual.nome;

    let newIdentifier = uraIdentifier;

    if (nomeMudou) {
      const [dup] = await pool.query(
        `SELECT ura_identifier
         FROM uras
         WHERE tenant_id = ?
           AND nome = ?
           AND ura_identifier <> ?
         LIMIT 1`,
        [tenant, nomeNovo, uraIdentifier],
      );

      if (dup.length) {
        return res.status(409).json({
          error: "Já existe uma URA com esse nome neste tenant",
        });
      }

      newIdentifier = `u${tenant}-${slugName(nomeNovo)}`;
    }

    /*
     * Monta os valores de acordo com o tipo.
     *
     * Normal:
     *   ia_id = NULL
     *   saudacao_ia = NULL
     *
     * IA:
     *   audio = NULL
     *   max_digits = NULL
     *   tentativas = NULL
     *   timeout = NULL
     */
    let values;

    if (tipoNovo === "IA") {
      values = {
        nome: nomeNovo,
        tipo: "IA",
        ia_id: ia_id ?? atual.ia_id,
        saudacao_ia: saudacao_ia ?? atual.saudacao_ia,
        audio: null,
        max_digits: null,
        tentativas: null,
        timeout: null,
      };
    } else {
      values = {
        nome: nomeNovo,
        tipo: "Normal",
        ia_id: null,
        saudacao_ia: null,
        audio: audio ?? atual.audio,
        max_digits:
          max_digits !== undefined
            ? Number(max_digits)
            : atual.max_digits,
        tentativas:
          tentativas !== undefined
            ? Number(tentativas)
            : atual.tentativas,
        timeout:
          timeout !== undefined
            ? Number(timeout)
            : atual.timeout,
      };
    }

    /*
     * Atualiza a URA
     */
    await pool.query(
      `UPDATE uras
       SET
         nome = ?,
         tipo = ?,
         ia_id = ?,
         saudacao_ia = ?,
         audio = ?,
         max_digits = ?,
         tentativas = ?,
         timeout = ?,
         ativo = ?,
         ura_identifier = ?
       WHERE ura_identifier = ?
         AND tenant_id = ?`,
      [
        values.nome,
        values.tipo,
        values.ia_id,
        values.saudacao_ia,
        values.audio,
        values.max_digits,
        values.tentativas,
        values.timeout,
        ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo,
        newIdentifier,
        uraIdentifier,
        tenant,
      ],
    );

    /*
     * Se o nome mudou, atualiza o vínculo das opções
     */
    if (nomeMudou) {
      await pool.query(
        `UPDATE ura_opcoes
         SET ura_identifier = ?
         WHERE ura_identifier = ?`,
        [newIdentifier, uraIdentifier],
      );
    }

    res.json({
      ok: true,
      ura_identifier: newIdentifier,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.delete("/uras/:ura_identifier", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;

  try {
    await pool.query(
      `DELETE FROM ura_opcoes
       WHERE ura_identifier = ?`,
      [uraIdentifier],
    );

    await pool.query(
      `DELETE FROM uras
       WHERE ura_identifier = ?
         AND tenant_id = ?`,
      [uraIdentifier, tenant],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.put("/uras/:ura_identifier/ativo", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;

  const uraIdentifier = req.params.ura_identifier;
  const { ativo } = req.body || {};

  if (!uraIdentifier) return;

  try {
    await pool.query(
      `UPDATE uras
       SET ativo = ?
       WHERE ura_identifier = ?
         AND tenant_id = ?`,
      [ativo, uraIdentifier, tenant],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
