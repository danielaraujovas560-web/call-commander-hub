const express = require("express");
const router = express.Router();
const { publicar } = require("../ramal-monitor");

router.post("/api/internal/cdr-updated", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "";
  if (!ip.includes("127.0.0.1") && !ip.includes("::1") && !ip.includes("localhost")) {
    return res.status(403).json({ error: "Acesso restrito ao localhost" });
  }

  const { tenantId } = req.body;

  if (tenantId) {
    publicar(String(tenantId), "CDR_UPDATED", {});
  }
  return res.json({ ok: true });
});

module.exports = router;
