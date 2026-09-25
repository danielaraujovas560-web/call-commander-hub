const pool = require("../config/db");

async function resolveTenantId(userId, role, override) {
  if (override != null && override !== "" && !isNaN(Number(override))) {
    const overrideId = Number(override);
    if (role === "admin") return overrideId;

    const [[linked]] = await pool.query(
      "SELECT 1 AS ok FROM tenants_link WHERE user_id = ? AND tenant_id = ? LIMIT 1",
      [userId, overrideId],
    );
    if (linked) return overrideId;

    const [[cliente]] = await pool.query(
      "SELECT 1 AS ok FROM clientes WHERE tenant_id = ? LIMIT 1",
      [overrideId],
    );
    if (cliente) return overrideId;

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

// Mantemos o getTenant por compatibilidade se alguma rota legada ainda o chamar diretamente,
// mas agora ele é seguro e lê o tenant já validado do req.
function getTenant(req, res) {
  if (req.tenantId) return req.tenantId;

  const t = Number(req.header("X-Tenant-Id") || req.query?.tenant_id);
  if (!t || Number.isNaN(t)) {
    if (res && !res.headersSent) {
      res.status(400).json({ error: "X-Tenant-Id header required" });
    }
    return null;
  }
  return t;
}

module.exports = {
  resolveTenantId,
  getTenant,
};
