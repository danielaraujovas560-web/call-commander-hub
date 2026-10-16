const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  numeroValido,
  validarConfiguracaoIA,
  validarVozDoTenant,
  validarModelo,
  validarVoz,
} = require("../utils/ia");

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

router.post("/ia", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const erroValidacao = validarConfiguracaoIA(req.body);

    if (erroValidacao) {
      return res.status(400).json({ error: erroValidacao });
    }

    const {
      nome,
      ia_model_id_logica,
      ia_voice_id,
      confianca_minima = 0.750,
      tempo_maximo = 15,
      silencio_apos_fala = 1.50,
      ativa = true,
    } = req.body;

    if (!(await validarModelo(ia_model_id_logica, "Logico"))) {
      return res.status(400).json({
        error: "O modelo lógico não existe, está inativo ou não é do tipo Logico",
      });
    }

    const voz = await validarVozDoTenant(ia_voice_id, tenant);

    if (!voz) {
      return res.status(400).json({
        error: "A voz não existe neste tenant ou seu modelo está inativo",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO ia (
        tenant_id,
        nome,
        ia_model_id_logica,
        ia_voice_id,
        confianca_minima,
        tempo_maximo,
        silencio_apos_fala,
        ativa
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tenant,
        nome.trim(),
        ia_model_id_logica,
        ia_voice_id,
        confianca_minima,
        tempo_maximo,
        silencio_apos_fala,
        ativa ? 1 : 0,
      ],
    );

    return res.status(201).json({
      mensagem: "Configuração de IA criada com sucesso",
      id: result.insertId,
    });
  } catch (e) {
    console.error("[POST /ia]", e);

    return res.status(500).json({
      error: "Erro ao criar configuração de IA",
    });
  }
});

router.put("/ia/:id", async (req, res) => {
  const tenant = req.tenantId;
  const { id } = req.params;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: "ID de configuração inválido",
    });
  }

  try {
    const erroValidacao = validarConfiguracaoIA(req.body);

    if (erroValidacao) {
      return res.status(400).json({ error: erroValidacao });
    }

    const {
      nome,
      ia_model_id_logica,
      ia_voice_id,
      confianca_minima = 0.750,
      tempo_maximo = 15,
      silencio_apos_fala = 1.50,
      ativa = true,
    } = req.body;

    const [existentes] = await pool.query(
      `
      SELECT id
      FROM ia
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
      [id, tenant],
    );

    if (!existentes.length) {
      return res.status(404).json({
        error: "Configuração de IA não encontrada",
      });
    }

    if (!(await validarModelo(ia_model_id_logica, "Logico"))) {
      return res.status(400).json({
        error: "O modelo lógico não existe, está inativo ou não é do tipo Logico",
      });
    }

    const voz = await validarVozDoTenant(ia_voice_id, tenant);

    if (!voz) {
      return res.status(400).json({
        error: "A voz não existe neste tenant ou seu modelo está inativo",
      });
    }

    await pool.query(
      `
      UPDATE ia
      SET
        nome = ?,
        ia_model_id_logica = ?,
        ia_voice_id = ?,
        confianca_minima = ?,
        tempo_maximo = ?,
        silencio_apos_fala = ?,
        ativa = ?
      WHERE id = ?
        AND tenant_id = ?
      `,
      [
        nome.trim(),
        ia_model_id_logica,
        ia_voice_id,
        confianca_minima,
        tempo_maximo,
        silencio_apos_fala,
        ativa ? 1 : 0,
        id,
        tenant,
      ],
    );

    return res.status(200).json({
      mensagem: "Configuração de IA atualizada com sucesso",
    });
  } catch (e) {
    console.error("[PUT /ia/:id]", e);

    return res.status(500).json({
      error: "Erro ao atualizar configuração de IA",
    });
  }
});

router.delete("/ia/:id", async (req, res) => {
  const tenant = req.tenantId;
  const { id } = req.params;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: "ID de configuração inválido",
    });
  }

  try {
    const [result] = await pool.query(
      `
      DELETE FROM ia
      WHERE id = ?
        AND tenant_id = ?
      `,
      [id, tenant],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Configuração de IA não encontrada",
      });
    }

    return res.status(204).end();
  } catch (e) {
    console.error("[DELETE /ia/:id]", e);

    return res.status(500).json({
      error: "Erro ao excluir configuração de IA",
    });
  }
});

router.post("/ia-voices", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const erroValidacao = validarVoz(req.body);

    if (erroValidacao) {
      return res.status(400).json({ error: erroValidacao });
    }

    const { nome, voice_id, ia_model_id } = req.body;

    if (!(await validarModelo(ia_model_id, "Voz"))) {
      return res.status(400).json({
        error: "O modelo não existe, está inativo ou não é do tipo Voz",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO ia_voices (
        tenant_id,
        nome,
        voice_id,
        ia_model_id
      )
      VALUES (?, ?, ?, ?)
      `,
      [tenant, nome.trim(), voice_id.trim(), ia_model_id],
    );

    return res.status(201).json({
      mensagem: "Voz criada com sucesso",
      id: result.insertId,
    });
  } catch (e) {
    console.error("[POST /ia-voices]", e);

    return res.status(500).json({
      error: "Erro ao criar voz",
    });
  }
});

router.put("/ia-voices/:id", async (req, res) => {
  const tenant = req.tenantId;
  const { id } = req.params;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: "ID de voz inválido",
    });
  }

  try {
    const erroValidacao = validarVoz(req.body);

    if (erroValidacao) {
      return res.status(400).json({ error: erroValidacao });
    }

    const { nome, voice_id, ia_model_id } = req.body;

    const [existentes] = await pool.query(
      `
      SELECT id
      FROM ia_voices
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
      [id, tenant],
    );

    if (!existentes.length) {
      return res.status(404).json({
        error: "Voz não encontrada",
      });
    }

    if (!(await validarModelo(ia_model_id, "Voz"))) {
      return res.status(400).json({
        error: "O modelo não existe, está inativo ou não é do tipo Voz",
      });
    }

    await pool.query(
      `
      UPDATE ia_voices
      SET
        nome = ?,
        voice_id = ?,
        ia_model_id = ?
      WHERE id = ?
        AND tenant_id = ?
      `,
      [
        nome.trim(),
        voice_id.trim(),
        ia_model_id,
        id,
        tenant,
      ],
    );

    return res.status(200).json({
      mensagem: "Voz atualizada com sucesso",
    });
  } catch (e) {
    console.error("[PUT /ia-voices/:id]", e);

    return res.status(500).json({
      error: "Erro ao atualizar voz",
    });
  }
});

router.delete("/ia-voices/:id", async (req, res) => {
  const tenant = req.tenantId;
  const { id } = req.params;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: "ID de voz inválido",
    });
  }

  try {
    const [vozes] = await pool.query(
      `
      SELECT id
      FROM ia_voices
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
      [id, tenant],
    );

    if (!vozes.length) {
      return res.status(404).json({
        error: "Voz não encontrada",
      });
    }

    const [utilizacoes] = await pool.query(
      `
      SELECT id
      FROM ia
      WHERE ia_voice_id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
      [id, tenant],
    );

    if (utilizacoes.length) {
      return res.status(409).json({
        error: "Esta voz está vinculada a uma configuração de IA. Troque a voz antes de excluí-la.",
      });
    }

    const [result] = await pool.query(
      `
      DELETE FROM ia_voices
      WHERE id = ?
        AND tenant_id = ?
      `,
      [id, tenant],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Voz não encontrada",
      });
    }

    return res.status(204).end();
  } catch (e) {
    console.error("[DELETE /ia-voices/:id]", e);

    // Proteção adicional para a chave estrangeira de ia.ia_voice_id.
    if (e.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: "Esta voz está vinculada a uma configuração de IA e não pode ser excluída.",
      });
    }

    return res.status(500).json({
      error: "Erro ao excluir voz",
    });
  }
});

module.exports = router;
