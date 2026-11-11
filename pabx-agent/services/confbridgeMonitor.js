"use strict";
// ConfBridge: monitoramento AMI independente do ARI.
// iniciar({ server, jwtSecret }) deve ser executado uma vez, após app.listen().
const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
const jwt = require("jsonwebtoken");
const { URL } = require("url");
const { amiReady, amiAction, nextActionId, onAmiEvent } = require("../ami");

const salas = new Map();
const clientes = new Map();
let iniciado = false;
let sincronizando = null;
let eventosDuranteSnapshot = null;
let sequencia = 0;
const salaRegex = /^cc-t([1-9]\d*)-([ic])([1-9]\d*)$/;
const get = (e, k) => e?.[k.toLowerCase()] ?? e?.[k] ?? "";
const tipo = e => String(get(e, "Event")).toLowerCase();
const booleano = v => /^(yes|true|1|on)$/i.test(String(v));
function identificar(sala) {
  const m = salaRegex.exec(String(sala));
  return m ? { tenantId: m[1], tipo: m[2] === "i" ? "INTERNA" : "CHAMADA", conferenciaId: Number(m[3]) } : null;
}
function serializar(s) {
  return { sala: s.sala, tenantId: Number(s.tenantId), tipo: s.tipo, conferenciaId: s.conferenciaId,
    participantes: [...s.participantes.values()].sort((a,b) => a.canal.localeCompare(b.canal)),
    total: s.participantes.size };
}
function estado(sala, destino = salas) {
  const id = identificar(sala);
  if (!id) return null;
  if (!destino.has(sala)) destino.set(sala, { sala, ...id, participantes: new Map() });
  return destino.get(sala);
}
// SOFTPHONE_WS_TENANT_ISOLATION_V1: ticket de ramal só recebe suas salas.
function endpointLogicoDoCanal(canal) {
  const m = /^PJSIP\/(.+)-[0-9a-f]{8,16}$/i.exec(String(canal || ""));
  return m ? m[1].replace(/-(web|mobile)$/i, "") : null;
}
function podeVerConferencia(ws, conferencia) {
  if (!ws.confEndpointLogico) return true; // Painel: tenant já validado no ticket
  return (conferencia?.participantes || []).some(p =>
    endpointLogicoDoCanal(p.canal) === ws.confEndpointLogico
  );
}
function publicar(tenantId, payload) {
  const base = { ...payload, ts: Date.now(), sequencia: ++sequencia };
  for (const ws of clientes.get(String(tenantId)) || []) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (!ws.confEndpointLogico) { ws.send(JSON.stringify(base)); continue; }
    if (payload.tipo === "CONFERENCIAS_INICIAL") {
      const permitidas = (payload.conferencias || []).filter(c => podeVerConferencia(ws, c));
      ws.confSalasVisiveis = new Set(permitidas.map(c => c.sala));
      ws.send(JSON.stringify({ ...base, conferencias: permitidas }));
    } else if (payload.tipo === "CONFERENCIA_ATUALIZADA") {
      const sala = payload.conferencia?.sala;
      if (podeVerConferencia(ws, payload.conferencia)) {
        ws.confSalasVisiveis.add(sala);
        ws.send(JSON.stringify(base));
      } else if (ws.confSalasVisiveis.delete(sala)) {
        ws.send(JSON.stringify({ tipo: "CONFERENCIA_REMOVIDA", sala, ts: base.ts, sequencia: base.sequencia }));
      }
    } else if (payload.tipo === "CONFERENCIA_REMOVIDA") {
      if (ws.confSalasVisiveis.delete(payload.sala)) ws.send(JSON.stringify(base));
    }
  }
}
function aplicar(evt, destino = salas, emitir = true) {
  const ev = tipo(evt), sala = String(get(evt, "Conference"));
  const id = identificar(sala);
  if (!id || !ev.startsWith("confbridge")) return;
  if (ev === "confbridgeend") {
    destino.delete(sala);
    if (emitir) publicar(id.tenantId, { tipo: "CONFERENCIA_REMOVIDA", sala });
    return;
  }
  if (!["confbridgestart","confbridgejoin","confbridgeleave","confbridgemute","confbridgeunmute","confbridgetalking"].includes(ev)) return;
  // Não inventar participante sem canal; início da sala não significa participante.
  const s = estado(sala, destino);
  const canal = String(get(evt, "Channel"));
  if (ev === "confbridgeleave") s.participantes.delete(canal);
  else if (canal && ev !== "confbridgestart") {
    const anterior = s.participantes.get(canal) || { canal, nome: "", numero: "", mutado: false, falando: false };
    const nome = get(evt, "CallerIDName"), numero = get(evt, "CallerIDNum");
    const p = { ...anterior, nome: nome ? String(nome) : anterior.nome, numero: numero ? String(numero) : anterior.numero };
    if (ev === "confbridgejoin") p.mutado = booleano(get(evt,"Muted"));
    if (ev === "confbridgemute") p.mutado = true;
    if (ev === "confbridgeunmute") p.mutado = false;
    if (ev === "confbridgetalking") p.falando = booleano(get(evt,"TalkingStatus")) || /^on$/i.test(String(get(evt,"Status")));
    s.participantes.set(canal,p);
  }
  if (emitir) publicar(id.tenantId, { tipo: "CONFERENCIA_ATUALIZADA", conferencia: serializar(s) });
}
function listarEventos(action, nomeItem, nomeFinal, opts = {}, timeout = 7500) {
  return new Promise((resolve,reject) => {
    if (!amiReady()) return reject(new Error("AMI indisponível"));
    const actionid = nextActionId();
    const itens = []; let concluido = false;
    function fim(err) { if(concluido) return; concluido=true; clearTimeout(timer); cancelar(); err ? reject(err) : resolve(itens); }
    const cancelar = onAmiEvent(e => {
      if (String(get(e,"ActionID")) !== actionid) return;
      const n = tipo(e);
      if(n === nomeItem) itens.push(e);
      if(n === nomeFinal) fim();
    });
    const timer = setTimeout(() => fim(new Error(`Timeout ${action}`)), timeout);
    amiAction({action, actionid, ...opts}, timeout).then(res => {
if (String(get(res, "Response")).toLowerCase() === "error") {
  const mensagem = String(get(res, "Message") || action);

  if (
    action === "ConfbridgeListRooms" &&
    /no active conferences/i.test(mensagem)
  ) {
    return fim();
  }

  fim(new Error(mensagem));
}
    }).catch(fim);
  });
}
async function sincronizar() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    eventosDuranteSnapshot = [];
    try {
      const rooms = await listarEventos("ConfbridgeListRooms", "confbridgelistrooms", "confbridgelistroomscomplete");
      const novo = new Map();
      for (const room of rooms) {
        const sala = String(get(room,"Conference"));
        if (!identificar(sala)) continue;
        const s = estado(sala, novo);
        const pessoas = await listarEventos("ConfbridgeList", "confbridgelist", "confbridgelistcomplete", {conference:sala});
        for (const e of pessoas) {
          const canal = String(get(e,"Channel"));
          if(!canal) continue;
          s.participantes.set(canal, { canal, nome:String(get(e,"CallerIDName")), numero:String(get(e,"CallerIDNum")),
            mutado:booleano(get(e,"Muted")), falando:booleano(get(e,"Talking")) });
        }
      }
      // Eventos que aconteceram durante as consultas ganham prioridade sobre o snapshot.
      for (const e of eventosDuranteSnapshot) aplicar(e,novo,false);
      salas.clear();
      for (const [k,v] of novo) salas.set(k,v);
      for (const tenant of clientes.keys()) publicar(tenant,{tipo:"CONFERENCIAS_INICIAL", conferencias:listarTenant(tenant)});
      console.log(`[CONF-MONITOR] sincronizadas ${salas.size} salas`);
    } finally { eventosDuranteSnapshot = null; }
  })().finally(() => { sincronizando = null; });
  return sincronizando;
}
function listarTenant(tenant) {
  return [...salas.values()].filter(s => s.tenantId === String(tenant)).map(serializar);
}
function iniciar({ server, jwtSecret }) {
  if(iniciado) return; iniciado = true;
  if(!server || !jwtSecret) throw new Error("ConfBridge monitor: server e jwtSecret obrigatórios");
  onAmiEvent(evt => {
    const name = tipo(evt);
    if(!["confbridgestart","confbridgeend","confbridgejoin","confbridgeleave","confbridgemute","confbridgeunmute","confbridgetalking"].includes(name)) return;
    if(eventosDuranteSnapshot) eventosDuranteSnapshot.push(evt);
    else aplicar(evt);
  });
  // noServer: evita disputa de upgrade com /ws/ramais no mesmo HTTP server.
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, "http://localhost").pathname; }
    catch { return; }
    if (pathname !== "/ws/conferencias") return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  });
  wss.on("connection",(ws,req) => {
    let claims;
    try {
      const ticket = new URL(req.url,"http://localhost").searchParams.get("ticket");
      if(!ticket) throw Error("ticket ausente");
      claims = jwt.verify(ticket,jwtSecret);
      if(claims.type !== "ramal_ws" || !claims.sub || !claims.tenant_id) throw Error("ticket inválido");
    } catch { ws.close(1008,"não autenticado"); return; }
    const tenant=String(claims.tenant_id);
    ws.confEndpointLogico = claims.endpoint_id ? String(claims.endpoint_id).replace(/-(web|mobile)$/i, "") : null;
    ws.confSalasVisiveis = new Set();
    if(!clientes.has(tenant)) clientes.set(tenant,new Set());
    clientes.get(tenant).add(ws);
    const visiveis = listarTenant(tenant).filter(c => podeVerConferencia(ws,c));
    ws.confSalasVisiveis = new Set(visiveis.map(c=>c.sala));
    ws.send(JSON.stringify({tipo:"CONFERENCIAS_INICIAL",conferencias:visiveis,ts:Date.now()}));
    ws.on("close",()=>{clientes.get(tenant)?.delete(ws);if(!clientes.get(tenant)?.size) clientes.delete(tenant);});
    ws.on("error",e=>console.error("[CONF-MONITOR] WS",e.message));
  });
  // Inicialização não depende do ARI. Sem listener adicional de onAmiConnect,
  // pois ami.js atualmente suporta apenas um callback e ele já é usado no server.js.
  if(amiReady()) void sincronizar().catch(e=>console.error("[CONF-MONITOR] snapshot",e.message));
  // Reconciliação periódica para restaurar estado após qualquer queda/reconexão AMI.
  setInterval(()=>{if(amiReady()) void sincronizar().catch(e=>console.error("[CONF-MONITOR] resync",e.message));}, 60000).unref();
  console.log("[CONF-MONITOR] /ws/conferencias iniciado");
}
module.exports={iniciar,sincronizar,listarTenant};
