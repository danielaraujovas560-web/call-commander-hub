const pool = require("../config/db");
const { getTenant } = require("./tenant");

function cdrFilteredEndpoint(router, path, cfg) {
  const exactFilters = new Set(cfg.exactFilters || []);
  router.get(path, async (req, res) => {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const where = [cfg.tenantWhere ? cfg.tenantWhere : `${cfg.tenantCol || "tenant_id"} = ?`];
    const vals = [tenant];
    for (const [key, col] of Object.entries(cfg.filters || {})) {
      const v = req.query[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        if (exactFilters.has(key)) {
          where.push(`${col} = ?`);
          vals.push(`${String(v).trim()}`);
        } else {
          where.push(`${col} LIKE ?`);
          vals.push(`%${String(v).trim()}%`);
        }
      }
    }
    if (cfg.dateCol) {
      const from = req.query.from,
        to = req.query.to;
      if (from) {
        where.push(`${cfg.dateCol} >= ?`);
        vals.push(String(from).replace("T", " "));
      }
      if (to) {
        where.push(`${cfg.dateCol} <= ?`);
        vals.push(String(to).replace("T", " "));
      }
    }
    if (req.query.rank === "true") {
      const sql = `
            SELECT
                ${cfg.rankCol} AS nome,
                COUNT(*) AS total
            FROM ${cfg.from ?? cfg.table}
            WHERE ${where.join(" AND ")}
            GROUP BY ${cfg.rankCol}
            ORDER BY total DESC
            LIMIT 5
        `;

      try {
        const [rows] = await pool.query(sql, vals);
        return res.json({ rows });
      } catch (e) {
        return res.status(500).json({ error: String(e.message || e) });
      }
    }

    const orderCol = cfg.order || "id";
    const from = cfg.from ?? cfg.table;
    const countSql = `SELECT COUNT(*) AS total FROM ${from} WHERE ${where.join(" AND ")}`;
    const sql = `SELECT ${cfg.select} FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`;
    const dataVals = [...vals, limit, offset];
    try {
      const [[count]] = await pool.query(countSql, vals);
      const [rows] = await pool.query(sql, dataVals);
      res.json({
        rows,
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}

module.exports = cdrFilteredEndpoint;
