"use strict";
// Registra endpoints na instância de router já protegida por internalOnly.
// Em routes/interno.js, antes de module.exports:
// require("./conferencia-internal.routes")(router, internalOnly);

const temporaria = require("../services/conferenciaTemporaria");

module.exports = function registrarConferenciasInternas(router, internalOnly) {
  temporaria.iniciarMonitoramento();
  router.post("/api/internal/conferencias/temporaria", internalOnly, async (req, res) => {
    try {
      const { tenantId, canalOrigem, canalDestino, endpointConvidado } = req.body || {};
      const resultado = await temporaria.iniciar({ tenantId, canalOrigem, canalDestino, endpointConvidado });
      return res.status(202).json({ ok: true, ...resultado });
    } catch (err) {
      console.error("[CONF TEMP][INICIAR]", err);
      if (/AMI indisponível/.test(err.message)) {
        return res.status(503).json({ ok: false, error: "AMI indisponível" });
      }
      if (/inválidos|não pertence|não confere|mesma bridge|atendidos|ligação|dois canais|mesmo linkedid|convertida|ativo/i.test(err.message)) {
        return res.status(409).json({ ok: false, error: err.message });
      }
      return res.status(500).json({ ok: false, error: "Falha ao criar conferência" });
    }
  });

  router.get("/api/internal/conferencias/temporaria/:id", internalOnly, async (req, res) => {
    try {
      const conferencia = await temporaria.consultar({
        tenantId: req.query.tenantId,
        id: req.params.id,
      });
      if (!conferencia) return res.status(404).json({ ok: false, error: "Não encontrada" });
      return res.json({ ok: true, conferencia });
    } catch (err) {
      console.error("[CONF TEMP][STATUS]", err);
      return res.status(500).json({ ok: false, error: "Falha ao consultar conferência" });
    }
  });
};
