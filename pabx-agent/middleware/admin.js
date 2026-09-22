const pool = require("../config/db");

async function requireAdmin(req, res, next) {
  try {
    const role = await getUserRole(req.userId);
    if (role !== "admin")
      return res.status(403).json({ error: "Acesso restrito a administradores." });
    req.role = role;
    next();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

async function getUserRole(userId) {
  const [[row]] = await pool.query(
    "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role LIMIT 1",
    [userId],
  );
  return row?.role || "cliente";
}

module.exports = { requireAdmin, getUserRole };
