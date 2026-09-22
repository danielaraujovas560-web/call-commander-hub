const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function requireJwt(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "sem token" });

  try {
    const p = jwt.verify(m[1], JWT_SECRET);
    req.userId = p.sub;
    req.role = p.role;
    next();
  } catch {
    res.status(401).json({ error: "token inválido" });
  }
}

module.exports = requireJwt;
