const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");

router.get("/dashboard/call-summary", requireJwt, requireAdmin, async (req, res) => {
  try {
    const [summaryRows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(duracao), 0) AS duracao_total,
        COALESCE(
          SUM(duracao) / NULLIF(
            SUM(CASE WHEN status = 'ANSWER' THEN 1 ELSE 0 END),
            0
          ),
          0
        ) AS duracao_media
      FROM cdr_ramal
      WHERE date_time >= CURDATE()
        AND date_time < CURDATE() + INTERVAL 1 DAY
    `);

    const [rows] = await pool.query(`
      SELECT
        tipo_chamada,
        status,
        COUNT(*) AS quantidade
      FROM cdr_ramal
      WHERE date_time >= CURDATE()
        AND date_time < CURDATE() + INTERVAL 1 DAY
      GROUP BY tipo_chamada, status
      ORDER BY tipo_chamada, status
    `);

    const [yesterdayRows] = await pool.query(`
      SELECT
        COUNT(*) AS total
      FROM cdr_ramal
      WHERE date_time >= CURDATE() - INTERVAL 1 DAY
        AND date_time < CURDATE()
    `);

    res.json({
      ok: true,
      today: summaryRows[0],
      yesterday: yesterdayRows[0],
      calls: rows,
    });
  } catch (e) {
    console.error("[dashboard] erro ao buscar resumo de chamadas:", e);

    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
