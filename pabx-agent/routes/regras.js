const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { REGRAS_PREDEFINIDAS } = require("../utils/regras-dialplan");

router.get("/regras", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(400).json({ error: "TenantId é obrigatório" });
  try {
    const [rows] = await pool.query(
      `SELECT rt.id, rt.tronco_identifier, t.nome AS tronco_nome, rt.nome AS regra_nome, rt.tipo, rt.tipo_ligacao,
              rt.codigo_csp, rt.expressao, rt.expressao_transformada, rt.prioridade
         FROM regras_troncos rt LEFT JOIN troncos t
        ON rt.tronco_identifier = t.tronco_pjsip AND rt.tenant_id = t.tenant_id
        WHERE rt.tenant_id = ? ORDER BY rt.created_at`,
      [tenant],
    );
    res.json({ regras: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/regras", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;
  const {
    tronco_identifier,
    regra_nome,
    tipo,
    tipo_ligacao,
    codigo_csp,
    expressao,
    expressao_transformada,
    prioridade,
  } = req.body || {};
  if (
    !tronco_identifier ||
    !regra_nome ||
    !tipo ||
    !tipo_ligacao ||
    !expressao ||
    !expressao_transformada
  ) {
    return res
      .status(400)
      .json({
        error:
          "tronco_identifier, tronco_nome, regra_nome, tipo, tipo_ligacao, expressao e expressao_transformada obrigatórios",
      });
  }
  try {
    const [rows] = await pool.query(
      `INSERT INTO regras_troncos (tenant_id, tronco_identifier, nome, tipo, tipo_ligacao, codigo_csp, expressao, expressao_transformada, prioridade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant,
        tronco_identifier,
        regra_nome,
        tipo,
        tipo_ligacao,
        codigo_csp,
        expressao,
        expressao_transformada,
        prioridade,
      ],
    );
    res.json({ ok: true, regras: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/regras/predefinidas", async (req, res) => {
  const tenant = req.tenantId;
  const { tronco_identifier, tipo } = req.body || {};

  if (!tenant || !tronco_identifier || !tipo) {
    return res.status(400).json({
      error: "Tenant, tronco e tipo são obrigatórios",
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Descobre o tipo diretamente no banco.
    const regras = REGRAS_PREDEFINIDAS[tipo];

    if (!regras?.length) {
      await conn.rollback();
      return res.status(400).json({
        error: "Não existem regras predefinidas para este tipo de tronco",
      });
    }

    // Evita cadastrar o mesmo conjunto várias vezes.
    const [existentes] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM regras_troncos
       WHERE tenant_id = ? AND tronco_identifier = ? AND tipo = ?`,
      [tenant, tronco_identifier, tipo],
    );

    if (existentes[0].total > 0) {
      await conn.rollback();
      return res.status(409).json({
        error: `Este tronco já possui regras do tipo ${tipo}. Exclua-as antes de gerar as predefinidas.`,
      });
    }

    for (const regra of regras) {
      await conn.query(
        `INSERT INTO regras_troncos (
          tenant_id,
          tronco_identifier,
          nome,
          tipo,
          tipo_ligacao,
          codigo_csp,
          expressao,
          expressao_transformada,
          prioridade
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenant,
          tronco_identifier,
          regra.nome,
          tipo,
          regra.tipo_ligacao,
          regra.codigo_csp ?? null,
          regra.expressao,
          regra.expressao_transformada,
          regra.prioridade,
        ],
      );
    }

    await conn.commit();

    return res.status(201).json({
      ok: true,
      total: regras.length,
      tipo: tipo,
      tronco_identifier,
    });
  } catch (error) {
    await conn.rollback();

    return res.status(500).json({
      error: String(error.message || error),
    });
  } finally {
    conn.release();
  }
});

router.put("/regras/:id", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(400).json({ error: "TenantId é obrigatório" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id é obrigatório" });
  const {
    regra_nome,
    tipo,
    tipo_ligacao,
    codigo_csp,
    expressao,
    expressao_transformada,
    prioridade,
  } = req.body || {};
  try {
    const [rows] = await pool.query(
      `UPDATE regras_troncos SET nome = ?, tipo = ?, tipo_ligacao = ?, codigo_csp = ?, expressao = ?, expressao_transformada = ?, prioridade = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        regra_nome,
        tipo,
        tipo_ligacao,
        codigo_csp,
        expressao,
        expressao_transformada,
        prioridade,
        id,
        tenant,
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/regras/lote", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(401).json({ error: "Tenant não identificado" });
  const { regras_ids, tronco_identifier, tipo } = req.body || {};
  if (!Array.isArray(regras_ids) || regras_ids.length === 0)
    return res.status(400).json({ error: "Informe ao menos uma regra" });

  const regras = regras_ids.map((id) => String(id).trim()).filter(Boolean);

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    let quantidade = 0;

    for (const regrasId of regras) {
      const [resultRegras] = await conn.query(
        `DELETE FROM regras_troncos WHERE id = ? AND tenant_id = ? AND tronco_identifier = ? AND tipo = ? `,
        [regrasId, tenant, tronco_identifier, tipo],
      );

      if (resultRegras.affectedRows > 0) quantidade += resultRegras.affectedRows;
    }

    await conn.commit();

    return res.json({
      ok: true,
      quantidade,
      regras_ids: regras,
    });
  } catch (e) {
    await conn.rollback();

    console.log("Falhou o delete em lote");
    console.error("❌ Erro ao apagar regras em lote:", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  } finally {
    conn.release();
  }
});

router.delete("/regras/:id", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(400).json({ error: "TenantId é obrigatório" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id é obrigatório" });
  try {
    const [rows] = await pool.query(`DELETE FROM regras_troncos WHERE id = ? AND tenant_id = ?`, [
      id,
      tenant,
    ]);

    if (rows.affectedRows === 0) return res.status(404).json({ error: "Regra não encontrada" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
