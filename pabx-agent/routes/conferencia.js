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

router.get("/conferencias", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT nome, ramal, tipo, max_participantes,
              gravar, mixing_interval, permitir_video, ativo
         FROM conferencias
        WHERE tenant_id = ?
        ORDER BY id ASC`,
      [tenant],
    );
    res.json({ conferencias: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
