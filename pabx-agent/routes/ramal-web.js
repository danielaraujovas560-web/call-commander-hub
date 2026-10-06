const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, WSS_URL, SIP_PORT } = process.env;

router.get("/ws/ramais/token", async (req, res) => {
  try {
    if (req.authType === "ramal") {
      const ticket = jwt.sign(
        {
          sub: req.ramalEndpointId,
          endpoint_id: req.ramalEndpointId,
          tenant_id: req.ramalTenantId,
          type: "ramal_ws",
        },
        JWT_SECRET,
        { expiresIn: "60s" },
      );

      return res.json({ ticket });
    }

    const tenantId = req.tenantId;

    const ticket = jwt.sign(
      {
        sub: req.userId,
        role: req.role,
        tenant_id: tenantId,
        type: "ramal_ws",
      },
      JWT_SECRET,
      { expiresIn: "60s" },
    );

    return res.json({ ticket });
  } catch (e) {
    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.get("/ws/ramais-info", async (req, res) => {
  try {
    if (req.authType !== "ramal") {
      return res.status(403).json({
        error: "Esta rota exige autenticação de ramal",
      });
    }

    const tenantId = req.tenantId;
    const endpointId = req.ramalEndpointId;

    const [clientes] = await pool.query(
      `
        SELECT
          cnpj,
          razao_social
        FROM clientes
        WHERE tenant_id = ?
        LIMIT 1
      `,
      [tenantId],
    );

    const [cdr] = await pool.query(
      `
        SELECT
          origem,
          destino,
          date_time,
          tipo_chamada,
          context,
          linkedid,
          duracao
        FROM cdr_ramal
        WHERE tenant_id = ?
          AND (
            (origem = ? AND tipo_chamada = 'Saida')
            OR
            (destino = ? AND tipo_chamada = 'Entrada')
          )
          AND date_time >= CURDATE()
        ORDER BY date_time DESC
        LIMIT 10
      `,
      [tenantId, endpointId, endpointId],
    );

    res.json({
      cliente: clientes[0] ?? null,
      ultimasChamadas: cdr,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
