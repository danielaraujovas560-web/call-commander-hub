const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function requireJwt(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);

  if (!m) {
    return res.status(401).json({
      error: "sem token",
    });
  }

  try {
    const p = jwt.verify(m[1], JWT_SECRET);

    if (p.type === "ramal") {
      if (!p.endpoint_id || !p.tenant_id) return res.status(401).json({ error: "token de ramal inválido" });

      req.authType = "ramal";
      req.ramalEndpointId = String(p.endpoint_id);
      req.ramalTenantId = p.tenant_id;

      return next();
    }

    req.authType = "user";
    req.userId = p.sub;
    req.role = p.role;

    next();
  } catch {
    return res.status(401).json({
      error: "token inválido",
    });
  }
}

module.exports = requireJwt;
