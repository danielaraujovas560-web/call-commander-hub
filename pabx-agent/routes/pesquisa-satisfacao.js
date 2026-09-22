const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");

function validatePesquisaBody(body) {
  const { nome_pesquisa, quantidade_op, perguntas } = body || {};
  if (!nome_pesquisa || String(nome_pesquisa).trim() === "") return "nome_pesquisa obrigatório";
  const qtd = Number(quantidade_op);
  if (!Number.isInteger(qtd) || qtd < 1)
    return "quantidade_op deve ser um número inteiro maior que zero";
  if (!Array.isArray(perguntas) || perguntas.length === 0) return "perguntas obrigatórias";
  if (perguntas.length !== qtd) {
    return `quantidade_op (${qtd}) não bate com o número de perguntas enviadas (${perguntas.length})`;
  }
  const ordens = new Set();
  for (const p of perguntas) {
    if (!p.audio || String(p.audio).trim() === "") return "toda pergunta precisa de um áudio";
    const md = Number(p.max_digit);
    if (!Number.isInteger(md) || md < 1)
      return "max_digit deve ser um número inteiro maior que zero";
    const ord = Number(p.ordem);
    if (!Number.isInteger(ord) || ord < 1) return "ordem deve ser um número inteiro maior que zero";
    if (ordens.has(ord)) return `ordem ${ord} está repetida entre as perguntas`;
    ordens.add(ord);
  }
  return null;
}

router.get("/pesquisa-satisfacao", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, tenant_id, nome_pesquisa, quantidade_op, ativo
         FROM pesquisa_satisfacao WHERE tenant_id = ? ORDER BY nome_pesquisa`,
      [tenant],
    );
    const pesquisas = rows.map((r) => ({ ...r, ativo: !!r.ativo }));
    for (const p of pesquisas) {
      const [perguntas] = await pool.query(
        `SELECT id, ordem, audio, max_digit FROM pesquisa_perguntas
          WHERE id_pesquisa = ? ORDER BY ordem`,
        [p.id],
      );
      p.perguntas = perguntas;
    }
    res.json({ pesquisas });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/pesquisa-satisfacao", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const err = validatePesquisaBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const { nome_pesquisa, quantidade_op, perguntas, ativo = true } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO pesquisa_satisfacao (tenant_id, nome_pesquisa, quantidade_op, ativo)
       VALUES (?, ?, ?, ?)`,
      [tenant, String(nome_pesquisa).trim(), Number(quantidade_op), ativo ? 1 : 0],
    );
    const pesquisaId = r.insertId;
    for (const p of perguntas) {
      await conn.query(
        `INSERT INTO pesquisa_perguntas (id_pesquisa, ordem, audio, max_digit)
         VALUES (?, ?, ?, ?)`,
        [pesquisaId, Number(p.ordem), String(p.audio).trim(), Number(p.max_digit)],
      );
    }
    await conn.commit();
    res.json({ ok: true, id: pesquisaId });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/pesquisa-satisfacao/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const err = validatePesquisaBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const { nome_pesquisa, quantidade_op, perguntas, ativo = true } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id FROM pesquisa_satisfacao WHERE id = ? AND tenant_id = ?`,
      [id, tenant],
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Pesquisa não encontrada" });
    }

    await conn.query(
      `UPDATE pesquisa_satisfacao SET nome_pesquisa = ?, quantidade_op = ?, ativo = ?
        WHERE id = ? AND tenant_id = ?`,
      [String(nome_pesquisa).trim(), Number(quantidade_op), ativo ? 1 : 0, id, tenant],
    );

    const idsEnviados = perguntas.map((p) => p.id).filter(Boolean);

    if (idsEnviados.length > 0) {
      await conn.query(`DELETE FROM pesquisa_perguntas WHERE id_pesquisa = ? AND id NOT IN (?)`, [
        id,
        idsEnviados,
      ]);
    } else {
      // Se não enviou nenhum ID válido, limpa tudo desse id_pesquisa
      await conn.query(`DELETE FROM pesquisa_perguntas WHERE id_pesquisa = ?`, [id]);
    }

    for (const p of perguntas) {
      if (p.id) {
        // Se já tem ID, faz um UPDATE (preserva estatísticas e chaves estrangeiras)
        await conn.query(
          `UPDATE pesquisa_perguntas
             SET ordem = ?, audio = ?, max_digit = ?
           WHERE id = ? AND id_pesquisa = ?`,
          [Number(p.ordem), String(p.audio).trim(), Number(p.max_digit), p.id, id],
        );
      } else {
        // Se veio sem ID (pergunta nova adicionada no front), faz um INSERT
        await conn.query(
          `INSERT INTO pesquisa_perguntas (id_pesquisa, ordem, audio, max_digit)
           VALUES (?, ?, ?, ?)`,
          [id, Number(p.ordem), String(p.audio).trim(), Number(p.max_digit)],
        );
      }
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

router.delete("/pesquisa-satisfacao/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM pesquisa_perguntas WHERE id_pesquisa = ?`, [id]);
    await pool.query(`DELETE FROM pesquisa_satisfacao WHERE id = ? AND tenant_id = ?`, [
      id,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
