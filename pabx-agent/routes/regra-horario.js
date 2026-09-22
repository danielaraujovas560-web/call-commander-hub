const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");

const ACAO_ENUM = ["RAMAL", "FILA", "URA", "EXTERNO", "INTERNO", "AUDIO"];

router.get("/regra-horario", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT regra_identifier, nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora
         FROM regra_horario WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    res.json({ regras: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/regra-horario", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora } = body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return res.status(400).json({ error: "nome, dias, hora_inicial e hora_final obrigatórios" });
  if (!ACAO_ENUM.includes(String(acao_dentro))) return res.status(400).json({ error: "acao_dentro inválido" });
  if (!ACAO_ENUM.includes(String(acao_fora))) return res.status(400).json({ error: "acao_fora inválido" });
  if (!destino_dentro || !destino_fora) return res.status(400).json({ error: "destinos obrigatórios" });
  const b = req.body;
  const slug = slugName(String(b.nome));
  if (!slug) return res.status(400).json({ error: "Nome da regra inválida" });
  const regraHorario = `rh${tenant}-${slug}`;
  try {
    const [r] = await pool.query(
      `INSERT INTO regra_horario (regra_horario, tenant_id, nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        regraHorario,
        tenant,
        String(b.nome),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        String(b.acao_dentro).toUpperCase(),
        String(b.destino_dentro).slice(0, 100),
        String(b.acao_fora).toUpperCase(),
        String(b.destino_fora).slice(0, 100),
      ],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/regra-horario/:regra_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const regraIdentifier = req.params.regra_identifier;
  if (!regraIdentifier) return res.status(400).json({ error: "É obrigatório enviar a regra" });
  const { nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora } = body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return res.status(400).json({ error: "nome, dias, hora_inicial e hora_final obrigatórios" });
  if (!ACAO_ENUM.includes(String(acao_dentro))) return res.status(400).json({ error: "acao_dentro inválido" });
  if (!ACAO_ENUM.includes(String(acao_fora))) return res.status(400).json({ error: "acao_fora inválido" });
  if (!destino_dentro || !destino_fora) return res.status(400).json({ error: "destinos obrigatórios" });
  const b = req.body;
  const slug = slugName(String(b.nome));
  if (!slug) return res.status(400).json({ error: "Nome da regra inválida" });
  const newRegraIdentifier = `rh${tenant}-${slug}`;
  try {
    await pool.query(
      `UPDATE regra_horario SET regra_identifier=?, nome=?, dias=?, hora_inicial=?, hora_final=?, acao_dentro=?, destino_dentro=?, acao_fora=?, destino_fora=?
       WHERE regra_identifier = ? AND tenant_id = ?`,
      [
        newRegraIdentifier,
        String(b.nome),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        String(b.acao_dentro).toUpperCase(),
        String(b.destino_dentro).slice(0, 100),
        String(b.acao_fora).toUpperCase(),
        String(b.destino_fora).slice(0, 100),
        regraIdentifier,
        tenant,
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/regra-horario/:regra_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const regraHorario = req.params.regra_identifier;
  if (!regraHorario) return res.status(400).json({ error: "É obrigatório enviar a regra" });
  try {
    await pool.query(`DELETE FROM regra_horario WHERE regra_identifier = ? AND tenant_id = ?`, [
      regraHorario,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
