const pool = require("../config/db");

async function resolveTenantId(userId, role, override) {
  if (override != null) {
    if (role === "admin") return Number(override);
    const [[linked]] = await pool.query(
      "SELECT 1 AS ok FROM tenants_link WHERE user_id = ? AND tenant_id = ? LIMIT 1",
      [userId, Number(override)],
    );
    if (linked) return Number(override);
    const [[cliente]] = await pool.query(
      "SELECT 1 AS ok FROM clientes WHERE tenant_id = ? LIMIT 1",
      [Number(override)],
    );
    if (cliente) return Number(override);
    throw new Error("Sem permissão para este tenant.");
  }

  const [[link]] = await pool.query(
    `SELECT tenant_id FROM tenants_link WHERE user_id = ?
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [userId],
  );
  if (link) return Number(link.tenant_id);

  if (role === "admin") {
    const [[anyLink]] = await pool.query(
      "SELECT tenant_id FROM tenants_link ORDER BY created_at ASC LIMIT 1",
    );
    if (anyLink) return Number(anyLink.tenant_id);
    throw new Error(
      "Nenhum tenant cadastrado no sistema. Crie um usuário cliente vinculado a um tenant_id primeiro.",
    );
  }

  throw new Error(
    "Nenhum tenant vinculado ao seu usuário. Peça a um administrador para vincular seu acesso.",
  );
}

function getTenant(req, res) {
  const t = Number(req.header("X-Tenant-Id"));
  if (!t || Number.isNaN(t)) {
    res.status(400).json({ error: "X-Tenant-Id header required" });
    return null;
  }
  return t;
}

module.exports = {
  resolveTenantId,
  getTenant,
};
