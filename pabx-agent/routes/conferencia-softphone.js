"use strict";
// Montar depois de requireJwt + tenantMiddleware. Não libera ações administrativas.
const express = require("express");
const db = require("../config/db");
const { amiAction, amiReady, nextActionId, onAmiEvent } = require("../ami");
const { listarTenant } = require("../services/confbridgeMonitor.service");
const conferenciaAmi = require("../services/conferenciaAmi");
const temporaria = require("../services/conferenciaTemporaria");
const router = express.Router();

const campo = (e, k) => e?.[k.toLowerCase()] ?? e?.[k] ?? "";
const numero = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const canalEndpoint = canal => {
  const m = /^PJSIP\/(.+)-[0-9a-f]{8,16}$/i.exec(String(canal));
  return m ? m[1] : null;
};
const logico = v => String(v || "").replace(/-(?:web|mobile)$/i, "");
const perfil = req => {
  if (req.authType !== "ramal") return null;
  const tenantId = numero(req.tenantId);
  const endpoint = logico(req.ramalEndpointId);
  return tenantId && /^\d{1,20}$/.test(endpoint) ? { tenantId, endpoint } : null;
};
function participanteProprio(p, base, dispositivo) {
  const endpoint = canalEndpoint(p.canal);
  if (!endpoint || logico(endpoint) !== base) return false;
  return !dispositivo || endpoint === (dispositivo === "base" ? base : `${base}-${dispositivo}`);
}
function buscarSala(tenantId, sala) {
  return listarTenant(tenantId).find(s => s.sala === sala) || null;
}
function autorizado(req, res) {
  const p = perfil(req);
  if (!p) { res.status(403).json({ error: "Token de ramal inválido" }); return null; }
  return p;
}
function salaAutorizada(p, sala) {
  const s = buscarSala(p.tenantId, sala);
  return s && s.participantes.some(x => participanteProprio(x, p.endpoint)) ? s : null;
}
function validarDispositivo(valor) {
  return ["base", "web", "mobile"].includes(valor) ? valor : null;
}
function acaoOk(response, name) {
  if (String(campo(response, "Response")).toLowerCase() !== "success") {
    throw new Error(`${name}: ${campo(response, "Message") || "rejeitado pelo Asterisk"}`);
  }
}
async function cadastroSala(tenantId, sala) {
  const m = /^cc-t(\d+)-([ic])(\d+)$/.exec(String(sala));
  if (!m || Number(m[1]) !== tenantId) return null;
  const tipo = m[2] === "i" ? "INTERNA" : "CHAMADA";
  const [rows] = await db.execute(
    "SELECT id, nome, ramal, tipo, ativo, max_participantes, gravar, mixing_interval FROM conferencias WHERE tenant_id=? AND id=? AND tipo=? LIMIT 1",
    [tenantId, Number(m[3]), tipo]
  );
  return rows[0] || null;
}
async function estadoCompleto(s, tenantId) {
  const cadastro = await cadastroSala(tenantId, s.sala);
  const [ramais] = await db.execute("SELECT endpoint_id, ramal, nome FROM ramais WHERE tenant_id=?", [tenantId]);
  const mapa = new Map(ramais.map(x => [String(x.endpoint_id), x]));
  return { ...s, nome: cadastro?.nome || (s.tipo === "CHAMADA" ? "Conferência temporária" : "Conferência"),
    ramal: cadastro?.ramal == null ? null : String(cadastro.ramal), participantes: s.participantes.map(x => {
      const endpoint = logico(canalEndpoint(x.canal));
      const r = mapa.get(endpoint);
      const ramal = r ? String(r.ramal) : "";
      const nomeRaw = String(r?.nome || "").trim().replace(new RegExp(`^${endpoint}\\s+`, "i"), "");
      const nome = nomeRaw && ![endpoint, ramal, "<unknown>"].includes(nomeRaw) ? nomeRaw : (ramal ? `Ramal ${ramal}` : "Participante externo");
      return { ...x, nome, ramal };
    }) };
}

router.get("/conferencias-softphone/estado", async (req, res) => {
  const p = autorizado(req, res); if (!p) return;
  try {
    const dispositivo = validarDispositivo(String(req.query.dispositivo || ""));
    const candidatas = listarTenant(p.tenantId).filter(s => s.participantes.some(x => participanteProprio(x, p.endpoint, dispositivo)));
    const dados = await Promise.all(candidatas.map(s => estadoCompleto(s, p.tenantId)));
    return res.json({ conferencias: dados });
  } catch (e) { console.error("[CONF SOFT][ESTADO]", e); return res.status(500).json({ error: "Falha ao consultar conferência" }); }
});

router.post("/conferencias-softphone/mute", async (req, res) => {
  const p = autorizado(req, res); if (!p) return;
  const { sala, mutado } = req.body || {};
  const dispositivo = validarDispositivo(req.body?.dispositivo);
  if (!dispositivo || typeof mutado !== "boolean" || typeof sala !== "string") return res.status(400).json({ error: "Parâmetros inválidos" });
  if (!amiReady()) return res.status(503).json({ error: "AMI indisponível" });
  const s = salaAutorizada(p, sala);
  if (!s) return res.status(403).json({ error: "Você não participa desta sala" });
  const propios = s.participantes.filter(x => participanteProprio(x, p.endpoint, dispositivo));
  if (propios.length !== 1) return res.status(409).json({ error: "Canal do dispositivo não identificado de forma única" });
  const canal = propios[0].canal;
  try {
    const action = mutado ? "ConfbridgeMute" : "ConfbridgeUnmute";
    acaoOk(await amiAction({ action, conference: sala, channel: canal }), action);
    return res.json({ ok: true, mutado, sala });
  } catch (e) { console.error("[CONF SOFT][MUTE]", e); return res.status(409).json({ error: "Não foi possível alterar o mute da conferência" }); }
});

router.post("/conferencias-softphone/convidar", async (req, res) => {
  const p = autorizado(req, res); if (!p) return;
  const { sala, ramal } = req.body || {};
  if (typeof sala !== "string" || !/^\d{1,20}$/.test(String(ramal || ""))) {
    return res.status(400).json({ error: "Informe um ramal interno" });
  }
  if (!amiReady()) return res.status(503).json({ error: "AMI indisponível" });
  const s = salaAutorizada(p, sala);
  if (!s) return res.status(403).json({ error: "Entre na conferência antes de convidar" });
  try {
    const conf = await cadastroSala(p.tenantId, sala);
    if (!conf || Number(conf.ativo) !== 1) return res.status(404).json({ error: "Conferência não disponível" });
    if (s.participantes.length >= Number(conf.max_participantes)) return res.status(409).json({ error: "Conferência lotada" });
    const [rows] = await db.execute("SELECT endpoint_id FROM ramais WHERE tenant_id=? AND ramal=? LIMIT 1", [p.tenantId, String(ramal)]);
    if (!rows.length) return res.status(404).json({ error: "Ramal não encontrado neste cliente" });
const base = String(rows[0].endpoint_id);

if (base === p.endpoint) {
  return res.status(409).json({
    error: "Você já participa desta conferência"
  });
}

if (s.participantes.some(x => participanteProprio(x, base))) {
  return res.status(409).json({
    error: "Ramal já está na sala"
  });
}

// Endpoint lógico obtido do banco, sem -web ou -mobile.
if (!/^\d{1,20}$/.test(base)) {
  return res.status(400).json({
    error: "Endpoint lógico inválido"
  });
}

const actionId = nextActionId();

const vars = {
  __CC_SALA: sala,
  __CC_CONF_AUTH: "1",
  __CC_MAX: String(conf.max_participantes),
  __CC_GRAVAR: Number(conf.gravar) ? "yes" : "no",
  __CC_INTERVALO: String(conf.mixing_interval),
  __CC_PARTICIPANTE: base,
  __TENANT_ID: String(p.tenantId)
};

const resposta = await amiAction({
  action: "Originate",
  actionid: actionId,

  channel: `Local/${base}@CC-CONFERENCIA-CONVITE`,

  context: "CC-CONFERENCIA-ENTRADA",
  exten: "s",
  priority: 1,

  callerid: `Conferencia <${conf.ramal || "9001"}>`,
  timeout: 65000,
  async: "true",

  variable: vars
});

acaoOk(resposta, "Originate");

return res.status(202).json({
  ok: true,
  actionId,
  status: "SOLICITADO",
  sala
});
  } catch (e) { console.error("[CONF SOFT][CONVIDAR]", e); return res.status(409).json({ error: "Convite rejeitado: " + e.message }); }
});

function listarCanais(timeout = 6000) {
  return new Promise((resolve, reject) => {
    const actionid = nextActionId(), canais = []; let done = false;
    let unsubscribe = () => {};
    const fim = err => { if (done) return; done = true; clearTimeout(timer); unsubscribe(); err ? reject(err) : resolve(canais); };
    unsubscribe = onAmiEvent(e => {
      if (String(campo(e, "ActionID")) !== actionid) return;
      const ev = String(campo(e,"Event")).toLowerCase();
      if (ev === "coreshowchannel") canais.push(e);
      if (ev === "coreshowchannelscomplete") fim();
    });
    const timer = setTimeout(() => fim(new Error("Timeout CoreShowChannels")), timeout);
    amiAction({ action: "CoreShowChannels", actionid }, timeout).then(r => {
      if (String(campo(r,"Response")).toLowerCase() === "error") fim(new Error("CoreShowChannels rejeitado"));
    }).catch(fim);
  });
}
router.post("/conferencias-softphone/temporaria", async (req, res) => {
  const p = autorizado(req, res); if (!p) return;
  const dispositivoOrigem = validarDispositivo(req.body?.dispositivoOrigem);
  const dispositivoConvidado = validarDispositivo(req.body?.dispositivoConvidado);
  const ramal = String(req.body?.ramal || "");
  if (!dispositivoOrigem || !dispositivoConvidado || !/^\d{1,20}$/.test(ramal)) return res.status(400).json({ error: "Parâmetros inválidos" });
  if (!amiReady()) return res.status(503).json({ error: "AMI indisponível" });
  try {
    const [rows] = await db.execute("SELECT endpoint_id FROM ramais WHERE tenant_id=? AND ramal=? LIMIT 1", [p.tenantId,ramal]);
    if (!rows.length) return res.status(404).json({ error: "Ramal convidado não pertence ao tenant" });
    const alvoBase = String(rows[0].endpoint_id);
    if (alvoBase === p.endpoint) return res.status(409).json({ error: "Selecione outro ramal" });
    const alvo = dispositivoConvidado === "base" ? alvoBase : `${alvoBase}-${dispositivoConvidado}`;
    const origemEndpoint = dispositivoOrigem === "base" ? p.endpoint : `${p.endpoint}-${dispositivoOrigem}`;
    const canais = await listarCanais();
    const origem = canais.filter(c => canalEndpoint(campo(c,"Channel")) === origemEndpoint && String(campo(c,"ChannelStateDesc")).toLowerCase() === "up" && !/confbridge/i.test(String(campo(c,"Application"))));
    if (origem.length !== 1) return res.status(409).json({ error: "Não foi possível identificar de forma única a chamada ativa neste dispositivo" });
    const retorno = await temporaria.iniciar({ tenantId: p.tenantId, canalOrigem: String(campo(origem[0],"Channel")), endpointConvidado: alvo });
    return res.status(202).json({ ok: true, ...retorno });
  } catch (e) { console.error("[CONF SOFT][TEMP]", e); return res.status(409).json({ error: e.message || "Falha ao criar conferência" }); }
});

module.exports = router;
