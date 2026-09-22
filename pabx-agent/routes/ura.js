const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const fs = require("fs/promises");
const path = require("path");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");

const {
  SOUNDS_BASE = "/var/lib/asterisk/sounds/",
} = process.env

router.get("/uras", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT u.ura_identifier, u.nome, u.audio, a.display_name, u.max_digits, u.tentativas, u.timeout, u.ativo
         FROM uras u LEFT JOIN audios a ON u.tenant_id = a.tenant_id AND u.audio = a.audio_identifier WHERE u.tenant_id = ? ORDER BY u.created_at ASC`,
      [tenant],
    );
    const uras = rows.map((r) => ({ ...r, ativo: !!r.ativo }));
    for (const u of uras) {
      const [opts] = await pool.query(
        `SELECT ura_identifier, digito, tipo_destino, destino FROM ura_opcoes WHERE ura_identifier = ? ORDER BY digito`,
        [u.ura_identifier],
      );
      u.opcoes = opts.map((o) => ({
        ...o,
        tipo_destino: String(o.tipo_destino || "").toUpperCase(),
      }));
    }
    res.json({ uras });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/uras/destinos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [filas] = await pool.query(
      `SELECT name AS value, display_name AS label FROM filas WHERE tenant_id = ? ORDER BY display_name`,
      [String(tenant)],
    );
    const [uras] = await pool.query(
      `SELECT ura_identifier AS value, nome AS label FROM uras WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    const [ramais] = await pool.query(
      `SELECT endpoint_id AS value, nome AS label FROM ramais WHERE tenant_id = ? ORDER BY endpoint_id`,
      [tenant],
    );
    const [troncos] = await pool.query(
      `SELECT tronco_pjsip AS value, nome AS label FROM troncos WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    const [regras] = await pool.query(
      `SELECT regra_identifier AS value, nome AS label FROM regra_horario WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    let audios = [];
    try {
      const dir = path.join(SOUNDS_BASE, `t${tenant}`);
      const files = await fs.readdir(dir);
      audios = files
        .filter((f) => f.toLowerCase().endsWith(".wav"))
        .map((f) => f.replace(/\.wav$/i, ""));
    } catch (_) {}
    res.json({ filas, uras, ramais, troncos, regras, audios });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/uras", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, audio, max_digits, tentativas, timeout, ativo } = req.body || {};
  if (!nome || !audio || max_digits == null || tentativas == null || timeout == null) {
    return res
      .status(400)
      .json({ error: "nome, audio, max_digits, tentativas, timeout obrigatórios" });
  }
  const slug = slugName(nome);
  const uraIdentifier = `u${tenant}-${slug}`;
  try {
    const [dup] = await pool.query(
      `SELECT ura_identifier FROM uras WHERE tenant_id = ? AND nome = ? LIMIT 1`,
      [tenant, nome],
    );
    if (dup.length)
      return res.status(409).json({ error: "Já existe uma URA com esse nome neste tenant" });
    const [r] = await pool.query(
      `INSERT INTO uras (ura_identifier, tenant_id, nome, audio, max_digits, tentativas, timeout, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uraIdentifier,
        tenant,
        nome,
        audio,
        Number(max_digits),
        Number(tentativas),
        Number(timeout),
        ativo ? 1 : 0,
      ],
    );
    res.json({ ok: true, ura_identifier: r.ura_identifier });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/uras/:ura_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  const { nome, audio, max_digits, tentativas, timeout, ativo } = req.body || {};
  const sets = [];
  const vals = [];
  const pushIf = (c, v, tr = (x) => x) => {
    if (v !== undefined) {
      sets.push(`${c} = ?`);
      vals.push(tr(v));
    }
  };
  pushIf("nome", nome);
  pushIf("audio", audio);
  pushIf("max_digits", max_digits, Number);
  pushIf("tentativas", tentativas, Number);
  pushIf("timeout", timeout, Number);
  if (!sets.length) return res.json({ ok: true });
  try {
    const [current] = await pool.query(
      `SELECT nome FROM uras WHERE tenant_id = ? AND ura_identifier = ? LIMIT 1`,
      [tenant, uraIdentifier],
    );
    if (!current.length) return res.status(404).json({ error: "URA não encontrada" });

    const nomeAtual = current[0].nome;
    const nomeNovo = nome ?? nomeAtual;
    const nomeMudou = nomeNovo !== nomeAtual;

    const newIdentifier = nomeMudou ? `u${tenant}-${slugName(nomeNovo)}` : uraIdentifier;

    if (nomeMudou) {
      const [dup] = await pool.query(
        `SELECT ura_identifier FROM uras WHERE tenant_id = ? AND nome = ? AND ura_identifier <> ? LIMIT 1`,
        [tenant, nome, uraIdentifier],
      );
      if (!dup.length) return res.status(409).json({ error: "" });

      sets.push("ura_identifier = ?");
      vals.push(newIdentifier);
    }
    await pool.query(
      `UPDATE uras SET ${sets.join(", ")} WHERE ura_identifier = ? AND tenant_id = ?`,
      [...vals, uraIdentifier, tenant],
    );
    await pool.query(`UPDATE ura_opcoes SET ura_identifier = ? WHERE ura_identifier = ?`, [
      newIdentifier,
      uraIdentifier,
    ]);
    res.json({ ok: true, ura_identifier: newIdentifier });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/uras/:ura_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  try {
    await pool.query(`DELETE FROM ura_opcoes WHERE ura_identifier = ?`, [uraIdentifier]);
    await pool.query(`DELETE FROM uras WHERE ura_identifier = ? AND tenant_id = ?`, [
      uraIdentifier,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/uras/:ura_identifier/ativo", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraIdentifier = req.params.ura_identifier;
  const { ativo } = req.body || {};
  if (!uraIdentifier) return;

  try {
    await pool.query(`UPDATE uras SET ativo = ? WHERE ura_identifier = ? AND tenant_id = ?`, [
      ativo,
      uraIdentifier,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
