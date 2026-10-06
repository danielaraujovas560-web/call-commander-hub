const { resolveTenantId } = require("../utils/tenant");

async function tenantMiddleware(req, res, next) {
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
    if (!req.userId && req.authType !== "ramal") {
      return res.status(401).json({
        error: "Usuário não autenticado.",
      });
    }

    let tenantId;

    if (req.authType === "ramal") {
      tenantId = req.ramalTenantId;
    } else {
      const requestedTenant =
        req.headers["x-tenant-id"] ||
        req.query?.tenant_id ||
        req.body?.tenant_id;

      tenantId = await resolveTenantId(
        req.userId,
        req.role,
        requestedTenant,
      );
    }

    req.tenantId = tenantId;

    next();
  } catch (err) {
    return res.status(403).json({
      error: err.message || "Acesso negado ao tenant.",
    });
  }
}

module.exports = tenantMiddleware;
