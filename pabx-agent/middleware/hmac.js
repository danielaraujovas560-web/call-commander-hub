const crypto = require("crypto");

const AGENT_SECRET      = process.env.AGENT_SECRET;
const SIGNATURE_WINDOW  = process.env.SIGNATURE_WINDOW ?? 30;

const ROTAS_LIVRES = [
  "/auth/",
  "/tenant/",
  "/admin/",
  "/clientes",
  "/my/",
  "/audit-log/",
  "/gravacoes/",
  "/ramal-auth/",
  "/config/",
  "/api/internal/",
];

function hmacMiddleware(req, res, next) {
  if (ROTAS_LIVRES.some((r) => req.path.startsWith(r))) return next();

  const ts = req.header("X-Timestamp");
  const sig = req.header("X-Signature");
  if (!ts || !sig) return res.status(401).json({ error: "Missing signature headers" });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > Number(SIGNATURE_WINDOW)) {
    return res.status(401).json({ error: "Timestamp out of window" });
  }

  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const p = req.originalUrl;
  const expected = crypto
    .createHmac("sha256", AGENT_SECRET)
    .update(`${ts}.${req.method.toUpperCase()}.${p}.${bodyHash}`)
    .digest("hex");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  next();
};

module.exports = hmacMiddleware;
