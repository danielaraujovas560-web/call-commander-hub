const express = require("express");
const router = express.Router();
const { publicar } = require("../ramal-monitor");

function internalOnly(req, res, next) {
  const recebida = Buffer.from(req.get("X-Internal-Key") || "");
  const esperada = Buffer.from(process.env.INTERNAL_KEY || "");
  const ok =
    esperada.length > 0 &&
    recebida.length === esperada.length &&
    crypto.timingSafeEqual(recebida, esperada);
  if (!ok) return res.status(403).json({ error: "Acesso restrito" });
  next();
}

router.post("/api/internal/cdr-updated", internalOnly, (req, res) => {
  const { tenantId, endpointIds } = req.body;

  if (tenantId) {
    publicar(String(tenantId), "CDR_UPDATED", {
      endpointIds: Array.isArray(endpointIds) ? endpointIds.map(String) : [],
    });
  }
  return res.json({ ok: true });
});

router.post("/api/internal/web-hook-whatsapp", internalOnly, (req, res) => {
  const { tenantId, callId, from, to } = req.body;

  return res.json({ ok: true });
});

module.exports = router;
