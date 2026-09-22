const authMiddleware = (req, res, next) => {
  // Tenta pegar o tenant_id do header (ou da query string se preferir)
  const tenantId = req.headers["x-tenant-id"] || req.query.tenant_id;
  if (!tenantId) {
    return res.status(401).json({ error: "Faltando identificação do Tenant (x-tenant-id)" });
  }
  // Salva no objeto req para a rota usar
  req.tenantId = tenantId;
  next();
};

module.exports = authMiddleware;
