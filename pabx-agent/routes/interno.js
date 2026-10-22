const express = require("express");
const router = express.Router();
const { publicar } = require("../ramal-monitor");

router.post("/api/internal/cdr-updated", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "";
  const local = ip.includes("127.0.0.1") || ip.includes("::1");
  if (!local || req.get("X-Internal-Key") !== process.env.INTERNAL_KEY) {
    return res.status(403).json({ error: "Acesso restrito" });
  }

  const { tenantId, endpointIds } = req.body;

  if (tenantId) {
    publicar(String(tenantId), "CDR_UPDATED", {
      endpointIds: Array.isArray(endpointIds) ? endpointIds.map(String) : [],
    });
  }
  return res.json({ ok: true });
});

router.post("/api/internal/web-hook-whatsapp", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "";
  const local = ip.includes("127.0.0.1") || ip.includes("::1");
  if (!local || req.get("X-Internal-Key") !== process.env.INTERNAL_KEY) {
    return res.status(403).json({ error: "Acesso restrito" });
  }

  const { tenantId, callId, from, to } = req.body;

  return res.json({ ok: true });
});

module.exports = router;
