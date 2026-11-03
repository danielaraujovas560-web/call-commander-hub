const pool = require("../config/db");
const { getTenant } = require("./tenant");
const { construirFiltros } = require("./cdr-query");

function cdrFilteredEndpoint(router, path, cfg) {
  router.get(path, async (req, res) => {
    const tenant = getTenant(req, res);
    if (!tenant) return;

    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const { where, vals } = construirFiltros(req.query, cfg, tenant);

    const from = cfg.from ?? cfg.table;

    if (req.query.rank === "true") {
      if (!cfg.rankCol) {
        return res.status(400).json({
          error: "Ranking não disponível para este relatório",
        });
      }

      const sql = `
        SELECT ${cfg.rankCol} AS nome, COUNT(*) AS total
        FROM ${from}
        WHERE ${where}
        GROUP BY ${cfg.rankCol}
        ORDER BY total DESC
        LIMIT 5
      `;

      try {
        const [rows] = await pool.query(sql, vals);
        return res.json({ rows });
      } catch (e) {
        return res.status(500).json({
          error: String(e.message || e),
        });
      }
    }

    const orderCol = cfg.order || "id";

    const countSql = `
      SELECT COUNT(*) AS total
      FROM ${from}
      WHERE ${where}
    `;

    const sql = `
      SELECT ${cfg.select}
      FROM ${from}
      WHERE ${where}
      ORDER BY ${orderCol} DESC
      LIMIT ? OFFSET ?
    `;

    try {
      const [[count]] = await pool.query(countSql, vals);
      const [rows] = await pool.query(sql, [...vals, limit, offset]);

      return res.json({
        rows,
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      });
    } catch (e) {
      return res.status(500).json({
        error: String(e.message || e),
      });
    }
  });
}

module.exports = cdrFilteredEndpoint;
