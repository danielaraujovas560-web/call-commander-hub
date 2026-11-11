"use strict";
// Montar APÓS requireJwt e tenantMiddleware no server.js.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { amiAction, amiReady } = require("../ami");
const { listarTenant } = require("../services/confbridgeMonitor");

const inteiro = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

router.get("/conferencias-controle/catalogo", async (req, res) => {
  if (req.authType !== "user") return res.status(403).json({ error: "Acesso restrito ao painel" });
  const tenantId = inteiro(req.tenantId);
  if (!tenantId) return res.status(403).json({ error: "Tenant inválido" });
  try {
    const [rows] = await db.execute(
      `SELECT id, nome, ramal, tipo FROM conferencias
       WHERE tenant_id = ? AND (tipo = 'INTERNA' OR (tipo = 'CHAMADA' AND ativo = 1))`,
      [tenantId],
    );
    res.json({ conferencias: rows.map(x => ({
      id: Number(x.id), nome: String(x.nome || ""),
      ramal: x.ramal == null ? null : String(x.ramal), tipo: String(x.tipo),
    })) });
  } catch (err) {
    console.error("[CONF CONTROLE][CATALOGO]", err);
    res.status(500).json({ error: "Erro ao consultar conferências" });
  }
});

router.post("/conferencias-controle/:tipo/:id/mute", async (req, res) => {
  if (req.authType !== "user") return res.status(403).json({ error: "Acesso restrito ao painel" });
  const tenantId = inteiro(req.tenantId);
  const id = inteiro(req.params.id);
  const tipo = req.params.tipo === "INTERNA" ? "INTERNA" : req.params.tipo === "CHAMADA" ? "CHAMADA" : null;
  const canal = req.body?.canal;
  const mutado = req.body?.mutado;
  if (!tenantId) return res.status(403).json({ error: "Tenant inválido" });
  if (!id || !tipo || typeof mutado !== "boolean" || typeof canal !== "string" ||
      !/^PJSIP\/[A-Za-z0-9_-]{1,80}-[0-9a-f]{8,16}$/i.test(canal)) {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }
  if (!amiReady()) return res.status(503).json({ error: "AMI indisponível" });
  const sala = `cc-t${tenantId}-${tipo === "INTERNA" ? "i" : "c"}${id}`;
  try {
    const [rows] = await db.execute(
      `SELECT id FROM conferencias WHERE tenant_id = ? AND id = ? AND tipo = ? LIMIT 1`,
      [tenantId, id, tipo],
    );
    if (!rows.length) return res.status(404).json({ error: "Conferência não encontrada" });

    // Nunca aceitar nome de sala arbitrário do cliente. O estado do monitor
    // confirma que o canal está participando da sala do tenant.
    const atual = listarTenant(tenantId).find(x => x.sala === sala);
    if (!atual || !atual.participantes.some(x => x.canal === canal)) {
      return res.status(409).json({ error: "Canal não está nesta conferência" });
    }

    const action = mutado ? "ConfbridgeMute" : "ConfbridgeUnmute";
    const resposta = await amiAction({ action, conference: sala, channel: canal }, 5000);
    if (String(resposta?.response ?? resposta?.Response).toLowerCase() !== "success") {
      return res.status(409).json({ error: String(resposta?.message ?? resposta?.Message ?? "Asterisk rejeitou a ação") });
    }
    console.log(`[CONF CONTROLE] ${action}: tenant=${tenantId} sala=${sala} canal=${canal}`);
    return res.json({ ok: true, sala, canal, mutado });
  } catch (err) {
    console.error("[CONF CONTROLE][MUTE]", err);
    return res.status(500).json({ error: "Falha ao atualizar mute pelo ConfBridge" });
  }
});

module.exports = router;
