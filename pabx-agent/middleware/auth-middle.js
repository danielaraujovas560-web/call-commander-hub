const { resolveTenantId } = require("../utils/tenant");

async function tenantMiddleware(req, res, next) {
  // Se a rota for pública/livre de tenant, passa direto
  if (
    req.path.startsWith("/auth/") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/tenant") ||
    req.path.startsWith("/my/tenants") ||
    req.path.startsWith("/clientes") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/firewall")
  ) {
    return next();
  }
  try {
    // Exige que o JWT já tenha sido validado nas rotas que precisam dele
    if (!req.userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    // Tenta obter o tenant informado pelo frontend (Header, Query ou Body)
    const requestedTenant =
      req.headers["x-tenant-id"] || req.query?.tenant_id || req.body?.tenant_id;

    // Executa a resolução e validação contra o banco de dados
    const tenantId = await resolveTenantId(req.userId, req.role, requestedTenant);

    // Injeta o tenant_id validado e seguro dentro da requisição
    req.tenantId = tenantId;
    next();
  } catch (err) {
    return res.status(403).json({ error: err.message || "Acesso negado ao tenant." });
  }
}

module.exports = tenantMiddleware;
