const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");
const { getTenant } = require("../utils/tenant");
const { queueAdd, queueRemove, queuePenalty } = require("../ami.js");

router.get("/filas/:name/agentes", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const filaName = req.params.name;
  try {
    const [filaRows] = await pool.query(
      `SELECT name, display_name, description, gravacao, ativo
         FROM filas WHERE tenant_id = ? AND name = ? LIMIT 1`,
      [tenant, filaName],
    );
    if (filaRows.length === 0) return res.status(404).json({ error: "Fila não encontrada" });
    const fila = filaRows[0];

    const [agentes] = await pool.query(
      `SELECT id, interface, penalty, membername, ramal
         FROM filas_agentes
        WHERE tenant_id = ? AND queue = ?
        ORDER BY penalty, id`,
      [tenant, fila.name],
    );

    const [queueRows] = await pool.query(
      `SELECT * FROM queues WHERE tenant_id = ? AND name = ? LIMIT 1`,
      [String(tenant), fila.name],
    );

    res.json({
      fila: { ...fila, ativo: !!fila.ativo },
      agentes,
      queue: queueRows[0] ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/filas/:name/agentes", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const filaName = req.params.name;
  const { ramal, penalty } = req.body || {};
  if (!ramal) return res.status(400).json({ error: "ramal obrigatório" });
  try {
    const [[fila]] = await pool.query(
      `SELECT name FROM filas WHERE name = ? AND tenant_id = ? LIMIT 1`,
      [filaName, tenant],
    );
    if (!fila) return res.status(404).json({ error: "Fila não encontrada" });

    const [[r]] = await pool.query(
      `SELECT ramal, nome, endpoint_id FROM ramais WHERE tenant_id = ? AND ramal = ? LIMIT 1`,
      [tenant, String(ramal)],
    );
    if (!r) return res.status(404).json({ error: "Ramal não encontrado" });

    const iface = `Local/${r.endpoint_id}@fila-membro`;
    const sinterface = `Custom:${r.endpoint_id}`;

    const [dup] = await pool.query(
      `SELECT 1 FROM filas_agentes WHERE tenant_id = ? AND queue = ? AND interface = ? LIMIT 1`,
      [tenant, fila.name, iface],
    );
    if (dup.length) return res.status(409).json({ error: "Este ramal já está nesta fila." });

    await queueAdd({ queue: fila.name, interface: iface, stateInterface: sinterface, penalty, memberName: r.nome });

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO filas_agentes (id, tenant_id, queue, interface, state_interface, penalty, membername, ramal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenant, fila.name, iface, sinterface, penalty ?? null, r.nome, r.ramal],
    );

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/filas/agentes/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = req.params.id;
  try {
    const [[a]] = await pool.query(
      `SELECT queue, interface FROM filas_agentes WHERE id = ? AND tenant_id = ?`,
      [id, tenant],
    );
    if (!a) return res.status(404).json({ error: "Agente não encontrado nesta fila" });

    await queueRemove({ queue: a.queue, interface: a.interface });
    await pool.query(`DELETE FROM filas_agentes WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/filas/agentes/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = req.params.id;
  const { penalty } = req.body || {};
  if (penalty === undefined) return res.status(400).json({ error: "penalty obrigatório" });
  try {
    const [[a]] = await pool.query(
      `SELECT queue, interface FROM filas_agentes WHERE id = ? AND tenant_id = ?`,
      [id, tenant],
    );
    if (!a) return res.status(404).json({ error: "Agente não encontrado nesta fila" });

    await queuePenalty({ queue: a.queue, interface: a.interface, penalty });
    await pool.query(`UPDATE filas_agentes SET penalty = ? WHERE id = ? AND tenant_id = ?`, [
      penalty,
      id,
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
