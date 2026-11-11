const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/conferencias-agenda", async (req, res) => {
  try {
    // A autenticação e o tenant já passaram pelo server.js
    if (req.authType !== "ramal") {
      return res.status(403).json({
        error: "Acesso exclusivo para ramais autenticados",
      });
    }

    const tenantId = Number(req.tenantId);

    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      return res.status(403).json({
        error: "Tenant inválido",
      });
    }

    const [rows] = await pool.query(
      `
        SELECT
          id,
          nome,
          ramal
        FROM conferencias
        WHERE tenant_id = ?
        AND tipo = 'INTERNA'
        AND ativo = 1
        ORDER BY id ASC
      `,
      [tenantId],
    );

    return res.json({
      conferencia: rows.map((r) => ({
        id: Number(r.id),
        nome: String(r.nome),
        ramal: String(r.ramal)
      })),
    });
  } catch (error) {
    console.error("[CONFERENCIA-AGENDA]", error);

    return res.status(500).json({
      error: "Falha ao carregar agenda",
    });
  }
});

const TIPO_FIXO = "INTERNA";

function validarConferencia(body) {
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const ramal = typeof body?.ramal === "string" ? body.ramal.trim() : "";
  const max = Number(body?.max_participantes);
  const mixing = Number(body?.mixing_interval);
  const flags = ["gravar", "permitir_video", "ativo"];
  if (!nome || nome.length > 120) return { erro: "Nome inválido" };
  if (!/^\d{1,20}$/.test(ramal)) return { erro: "Ramal inválido" };
  if (!Number.isInteger(max) || max < 2 || max > 1000) return { erro: "Máximo de participantes inválido" };
  if (!Number.isInteger(mixing) || mixing < 10 || mixing > 1000) return { erro: "Mixing interval inválido" };
  if (flags.some((k) => typeof body?.[k] !== "boolean")) return { erro: "Opções booleanas inválidas" };
  return { nome, ramal, max, mixing,
    gravar: Number(body.gravar), permitir_video: Number(body.permitir_video), ativo: Number(body.ativo) };
}
function tenantConferencia(req, res) {
  const tenant = Number(req.tenantId);
  if (!Number.isSafeInteger(tenant) || tenant <= 0) {
    res.status(403).json({ error: "Tenant inválido" });
    return null;
  }
  return tenant;
}
function idConferencia(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return null;
  }
  return id;
}
function erroConferencia(res, e) {
  if (e?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ramal já cadastrado" });
  console.error("[CONFERENCIAS]", e);
  return res.status(500).json({ error: "Falha ao processar conferência" });
}

router.get("/conferencias", async (req, res) => {
  const tenant = tenantConferencia(req, res);
  if (tenant === null) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, ramal, tipo, max_participantes, gravar,
              mixing_interval, permitir_video, ativo
         FROM conferencias WHERE tenant_id = ? AND tipo = 'INTERNA' ORDER BY id ASC`, [tenant]);
    return res.json({ conferencias: rows });
  } catch (e) { return erroConferencia(res, e); }
});

router.post("/conferencias", async (req, res) => {
  const tenant = tenantConferencia(req, res);
  if (tenant === null) return;
  const d = validarConferencia(req.body);
  if (d.erro) return res.status(400).json({ error: d.erro });
  try {
    const [result] = await pool.query(
      `INSERT INTO conferencias
       (tenant_id, nome, ramal, tipo, max_participantes, gravar, mixing_interval, permitir_video, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant, d.nome, d.ramal, TIPO_FIXO, d.max, d.gravar, d.mixing, d.permitir_video, d.ativo]);
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (e) { return erroConferencia(res, e); }
});

router.put("/conferencias/:id", async (req, res) => {
  const tenant = tenantConferencia(req, res);
  if (tenant === null) return;
  const id = idConferencia(req, res);
  if (id === null) return;
  const d = validarConferencia(req.body);
  if (d.erro) return res.status(400).json({ error: d.erro });
  try {
    const [result] = await pool.query(
      `UPDATE conferencias SET nome = ?, ramal = ?, max_participantes = ?,
       gravar = ?, mixing_interval = ?, permitir_video = ?, ativo = ?
       WHERE id = ? AND tenant_id = ? AND tipo = ?`,
      [d.nome, d.ramal, d.max, d.gravar, d.mixing, d.permitir_video, d.ativo, id, tenant, TIPO_FIXO]);
    if (!result.affectedRows) return res.status(404).json({ error: "Conferência fixa não encontrada" });
    return res.json({ ok: true });
  } catch (e) { return erroConferencia(res, e); }
});

router.delete("/conferencias/:id", async (req, res) => {
  const tenant = tenantConferencia(req, res);
  if (tenant === null) return;
  const id = idConferencia(req, res);
  if (id === null) return;
  try {
    const [result] = await pool.query(
      "DELETE FROM conferencias WHERE id = ? AND tenant_id = ? AND tipo = ?",
      [id, tenant, TIPO_FIXO]);
    if (!result.affectedRows) return res.status(404).json({ error: "Conferência fixa não encontrada" });
    return res.json({ ok: true });
  } catch (e) { return erroConferencia(res, e); }
});

module.exports = router;
