const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/ia", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
  ia.id,
  ia.nome,
  ia.confianca_minima,
  ia.tempo_maximo,
  ia.silencio_apos_fala,
  ia.ativa,

  ml.id AS modelo_logico_id,
  ml.nome AS modelo_logico_nome,
  ml.provider AS modelo_logico_provider,
  ml.modelo AS modelo_logico_modelo,

  v.id AS voice_id,
  v.nome AS voice_nome,
  v.voice_id AS voice_provider_id,

  mv.id AS modelo_voz_id,
  mv.nome AS modelo_voz_nome,
  mv.provider AS modelo_voz_provider,
  mv.modelo AS modelo_voz_modelo

  FROM ia

INNER JOIN ia_models ml
  ON ml.id = ia.ia_model_id_logica

INNER JOIN ia_voices v
  ON v.id = ia.ia_voice_id

INNER JOIN ia_models mv
  ON mv.id = v.ia_model_id

WHERE ia.tenant_id = ?
ORDER BY ia.created_at ASC;
      `,
      [tenant],
    );

res.json({
  ia: rows.map((r) => ({
    id: r.id,
    nome: r.nome,

    confianca_minima: Number(r.confianca_minima),
    tempo_maximo: r.tempo_maximo,
    silencio_apos_fala: Number(r.silencio_apos_fala),
    ativa: !!r.ativa,

    modelo_logico: {
      id: r.modelo_logico_id,
      nome: r.modelo_logico_nome,
      provider: r.modelo_logico_provider,
      modelo: r.modelo_logico_modelo,
    },

    modelo_voz: {
      id: r.modelo_voz_id,
      nome: r.modelo_voz_nome,
      provider: r.modelo_voz_provider,
      modelo: r.modelo_voz_modelo,
    },

    voz: r.voice_id
      ? {
          id: r.voice_id,
          nome: r.voice_nome,
          voice_id: r.voice_provider_id,
        }
      : null,
  })),
});
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.get("/ia-models", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        nome,
        provider,
        modelo,
        tipo,
        ativo
      FROM ia_models
      WHERE ativo = 1
      ORDER BY tipo ASC, nome ASC
      `,
    );

    res.json({
      modelos: rows.map((r) => ({
        ...r,
        ativo: !!r.ativo,
      })),
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.get("/ia-voices", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        v.id,
        v.nome,
        v.voice_id,
        v.ia_model_id,

        m.nome AS modelo_nome,
        m.provider AS modelo_provider,
        m.modelo AS modelo

      FROM ia_voices v

      INNER JOIN ia_models m
        ON m.id = v.ia_model_id

      WHERE v.tenant_id = ?

      ORDER BY v.created_at ASC
      `,
      [tenant],
    );

    res.json({
      vozes: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        voice_id: r.voice_id,

        modelo: {
          id: r.ia_model_id,
          nome: r.modelo_nome,
          provider: r.modelo_provider,
          modelo: r.modelo,
        },
      })),
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
