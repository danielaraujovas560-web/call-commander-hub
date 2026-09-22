/* ramal-monitor.js
 *
 * - Escuta eventos ARI (chamadas, estado dos ramais)
 * - Mantém estado em memória por tenant
 * - Publica eventos pro front via WebSocket (ws)
 *
 * Uso:
 *   const { iniciarMonitor } = require("./ramal-monitor");
 *   iniciarMonitor(ariClient, httpServer);
 */

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
const { URL } = require("url");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = process.env;
const { setCustomDeviceState } = require("./ami");

// ─── Estado em memória ────────────────────────────────────────────────────────
// { [tenant_id]: { [endpoint]: { state, numero, linkedid, desde } } }
const estadoRamais = {};

// ─── Clientes WebSocket conectados ────────────────────────────────────────────
// { [tenant_id]: Set<WebSocket> }
const clientes = {};

//-- Ramais em memória para conexão e desconexão --------
const offlineTimers = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extrai o endpoint do nome do canal.
 * "PJSIP/19999-000002c1" → "19999"
 */
function extrairEndpoint(nomeCanal = "") {
  const match = nomeCanal.match(/PJSIP\/([^-]+)/);
  return match ? match[1] : null;
}

/**
 * Retorna o tenant_id do endpoint consultando o banco.
 * Injeta a função de query para não acoplar ao pool aqui.
 */
async function resolverTenant(endpoint, queryFn) {
  if (!endpoint) return null;
  try {
    const [rows] = await queryFn(
      "SELECT tenant_id FROM ramais WHERE endpoint_id = ? LIMIT 1",
      [endpoint]
    );
    return rows[0]?.tenant_id ?? null;
  } catch {
    return null;
  }
}

//Função para disparar o custom:{endpoint} para o AMI
async function atualizarDisponibilidadeAgente(tenantId, endpoint) {
  if (!tenantId || !endpoint) return;

  const ramais = estadoRamais[tenantId] ?? {};

  const baseOnline = !!ramais[endpoint];
  const webOnline = !!ramais[`${endpoint}-web`];

  const estado = baseOnline || webOnline
    ? "NOT_INUSE"
    : "UNAVAILABLE";

  try {
    await setCustomDeviceState(endpoint, estado);

    console.log(
      `[MONITOR] Custom:${endpoint} -> ${estado} ` +
      `(base=${baseOnline ? "online" : "offline"}, ` +
      `web=${webOnline ? "online" : "offline"})`
    );
  } catch (err) {
    console.error(
      `[MONITOR] erro atualizando Custom:${endpoint}:`,
      err.message || err
    );
  }
}

// ─── Publicar evento pro front ────────────────────────────────────────────────

function publicar(tenantId, tipo, payload) {
  const mensagem = JSON.stringify({ tipo, ...payload, ts: Date.now() });
  const alvos = clientes[tenantId];
  if (!alvos) return;
  for (const ws of alvos) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(mensagem);
    }
  }
}

// ─── Atualizar estado e notificar ─────────────────────────────────────────────

function atualizarEstado(tenantId, endpoint, dados) {
  if (!tenantId || !endpoint) return;

  if (!estadoRamais[tenantId]) estadoRamais[tenantId] = {};

  const anterior = estadoRamais[tenantId][endpoint] ?? {};
  estadoRamais[tenantId][endpoint] = { ...anterior, ...dados };

  publicar(tenantId, "RAMAL_STATUS", {
    endpoint,
    ...estadoRamais[tenantId][endpoint],
  });
}

function limparEstado(tenantId, endpoint) {
  if (!tenantId || !endpoint) return;
  if (!estadoRamais[tenantId]?.[endpoint]) return;

  estadoRamais[tenantId][endpoint] = {
    ...estadoRamais[tenantId][endpoint],
    state: "IDLE",
    numero: null,
    linkedid: null,
    desde: null,
  };

  publicar(tenantId, "RAMAL_STATUS", {
    endpoint,
    ...estadoRamais[tenantId][endpoint],
  });
}

// ---- Ramais onlines estado inicial -----

async function inicializarRamaisOnline(ariClient, queryFn) {
  try {
    const [rows] = await queryFn(
      `SELECT endpoint_id, tenant_id, registrado_desde
       FROM ramais
       WHERE endpoint_id IS NOT NULL`
    );

    const endpoints = await ariClient.endpoints.list();

    const endpointsOnline = new Set();

    for (const endpoint of endpoints) {
      const nome = endpoint.resource;

      if (!nome) continue;
      if (endpoint.technology !== "PJSIP") continue;
      if (endpoint.state !== "online") continue;

      endpointsOnline.add(nome);
    }

    // Reconstrói o estado em memória
    for (const tenantId of Object.keys(estadoRamais)) {
      estadoRamais[tenantId] = {};
    }

    let online = 0;
    let offline = 0;

    for (const row of rows) {
      const endpoint = String(row.endpoint_id);
      const tenantId = row.tenant_id;

      if (endpointsOnline.has(endpoint)) {
        if (!estadoRamais[tenantId]) {
          estadoRamais[tenantId] = {};
        }

        let registradoDesde = row.registrado_desde;

        // O ramal está online, mas o banco não tinha
        // o horário de registro.
        if (!registradoDesde) {
          await queryFn(
            `UPDATE ramais
             SET registrado_desde = NOW()
             WHERE endpoint_id = ?`,
            [endpoint]
          );
          const [[ramalAtualizado]] = await queryFn(
           `SELECT registrado_desde
            FROM ramais
            WHERE endpoint_id = ?
            LIMIT 1`,
            [endpoint]
          )
;
          registradoDesde = ramalAtualizado?.registrado_desde;
        }

        estadoRamais[tenantId][endpoint] = {
          endpoint,
          state: "IDLE",
          numero: null,
          linkedid: null,
          desde: null,
          conectadoDesde: new Date(registradoDesde).toISOString(),
        };

        online++;
      } else {
        // Está offline segundo o ARI.
        // Não mexemos em ultima_conexao aqui,
        // pois o Agent pode simplesmente ter reiniciado.
        offline++;
      }
    }

    // Depois de reconstruir o estado, atualiza
    // a disponibilidade lógica de cada agente.
    for (const row of rows) {
      const endpoint = String(row.endpoint_id);
      const tenantId = row.tenant_id;

      await atualizarDisponibilidadeAgente(
        tenantId,
        endpoint
      );
    }

    console.log(
      `[MONITOR] inicialização concluída: ` +
      `${online} ramais online, ${offline} offline`
    );
  } catch (err) {
    console.error(
      "[MONITOR] erro ao inicializar ramais:",
      err
    );
  }
}

// ─── Registrar eventos ARI + Função ultima conexão no banco ───────────────────────────────────
function registrarEventos(ariClient, queryFn) {

  // Registro/desregistro do ramal
  ariClient.on("ContactStatusChange", async (event) => {
    const endpoint = event.endpoint;
    if (!endpoint) return;

console.log(
  "[MONITOR] EVENTO ENDPOINT:",
  endpoint?.resource,
  endpoint?.technology,
  endpoint?.state
);

    const nome = endpoint.resource;
    if (!nome) return;

    if (endpoint.technology !== "PJSIP") return;
    const endpointBase = nome.replace(/-web$/, "");

    const tenantId = await resolverTenant(endpointBase, queryFn);
    if (!tenantId) return;

    if (endpoint.state === "online") {

      const chave = `${tenantId}:${endpointBase}`;
      const timer = offlineTimers.get(chave);

      if (timer) {
        clearTimeout(timer);
        offlineTimers.delete(chave);
       }

      const [[ramal]] = await queryFn(`SELECT registrado_desde FROM ramais WHERE endpoint_id = ? LIMIT 1`, [endpointBase]);

      let registradoDesde = ramal?.registrado_desde;

      if (!registradoDesde) {
        await queryFn(`UPDATE ramais SET registrado_desde = NOW() WHERE endpoint_id = ?`, [endpointBase]);
        console.log(`[MONITOR] LOGIN ${nome} | registrado_desde preenchido`);

        const [[ramalAtualizado]] = await queryFn(`SELECT registrado_desde FROM ramais WHERE endpoint_id = ? LIMIT 1`, [endpointBase]);
        registradoDesde = ramalAtualizado?.registrado_desde;
      }

      console.log("Horario de registro: ", registradoDesde);

      if (!estadoRamais[tenantId]) estadoRamais[tenantId] = {};

      const anterior = estadoRamais[tenantId][nome] ?? {
        endpoint: endpointBase,
        state: "IDLE",
        numero: null,
        linkedid: null,
        desde: null,
        conectadoDesde: registradoDesde,
      };

      estadoRamais[tenantId][nome] = {
        ...anterior,
      };

      await atualizarDisponibilidadeAgente(tenantId, endpointBase);

      publicar(tenantId, "RAMAL_STATUS", {
        endpoint: endpointBase,
        ...estadoRamais[tenantId][nome],
      });

      console.log(`[MONITOR] ramal conectado: ${nome}`);
      return;
    }

    if (endpoint.state === "offline") {

      const chave = `${tenantId}:${endpointBase}`;
      if (offlineTimers.has(chave)) return;

      const timer = setTimeout(async () => {
        offlineTimers.delete(chave);

       const ramais = estadoRamais[tenantId] ?? {};

       delete ramais[nome];

       const baseOnline = !!ramais[endpointBase];
       const webOnline = !!ramais[`${endpointBase}-web`];

       if (baseOnline || webOnline) return;

         await queryFn(`UPDATE ramais SET registrado_desde = NULL, ultima_conexao = NOW() WHERE endpoint_id = ?`, [endpointBase]);

         delete ramais[endpointBase];
         delete ramais[`${endpointBase}-web`];

         await atualizarDisponibilidadeAgente(tenantId, endpointBase);

         publicar(tenantId, "RAMAL_REMOVIDO", {
           endpoint: endpointBase,
         });

       console.log(`[MONITOR] desconexão total: ${endpointBase}`);
       }, 3000);
     offlineTimers.set(chave, timer);
    }
  });

  // Canal criado — ramal iniciou discagem ou está recebendo chamada
  ariClient.on("ChannelCreated", async (event) => {
    const canal    = event.channel;
    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) return;

    if (canal.dialplan?.context !== "Internal-default") {
      return;
    }

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    const numero = canal.dialplan?.exten ?? null;

    const stateMap = {
      Ring: "RING",
      Ringing: "RINGING",
      Up: "IN_CALL",
      Down: "IDLE",
    };

    const state = stateMap[canal.state] ?? "IDLE";

    atualizarEstado(tenantId, endpoint, {
      state,
      numero,
      linkedid: canal.id,
    });
  });

  // Dial — captura o número discado e o progresso
  ariClient.on("Dial", async (event) => {
    const caller   = event.caller?.name ?? event.caller;
    const endpoint = extrairEndpoint(typeof caller === "string" ? caller : caller?.name);
    if (!endpoint) return;

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    const dialstatus = event.dialstatus ?? "";

    // Primeira vez que o Dial dispara: dialstatus vazio = em progresso
    if (dialstatus === "") {
      atualizarEstado(tenantId, endpoint, {
        state:  "DIALING",
      });
      return;
    }

    // Resultado final da discagem
    const stateMap = {
      ANSWER:      "IN_CALL",
      PROGRESS:    "RINGING",
      RINGING:     "RINGING",
      CANCEL:      "IDLE",
      BUSY:        "IDLE",
      NOANSWER:    "IDLE",
      CONGESTION:  "IDLE",
      CHANUNAVAIL: "IDLE",
    };

    const state = stateMap[dialstatus] ?? "IDLE";

    atualizarEstado(tenantId, endpoint, {
      state,
      ...(state === "IN_CALL" ? {desde: new Date().toISOString() } : {}),
    });
  });

  // Mudança de estado do canal (Ringing, Up, etc.)
  ariClient.on("ChannelStateChange", async (event) => {
    const canal    = event.channel;
    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) return;
    if (canal.name.includes("t1-") || canal.name.includes("Tronco")) return;

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    const stateMap = {
      Ring:    "RING",
      Ringing: "RINGING",
      Up:      "IN_CALL",
      Down:    "IDLE",
    };

    const state = stateMap[canal.state];
    if (state) atualizarEstado(tenantId, endpoint, { state });
  });

  // Canal destruído — chamada encerrada
  ariClient.on("ChannelDestroyed", async (event) => {
    const canal    = event.channel;
    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) return;
    if (canal.name.includes("t1-") || canal.name.includes("Tronco")) return;

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    limparEstado(tenantId, endpoint);
  });
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────
function autenticarTicket(req) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const ticket = params.get("ticket");

  if (!ticket) return null;

  try {
    const payload = jwt.verify(ticket, JWT_SECRET);

    if (
      payload.type !== "ramal_ws" ||
      payload.sub == null ||
      payload.tenant_id == null
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      tenantId: Number(payload.tenant_id),
    };
  } catch {
    return null;
  }
}


function iniciarWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/ramais" });

  wss.on("connection", (ws, req) => {
    // Front passa o tenant_id na query string: /ws/ramais?tenant_id=1
    console.log("[WS] conexão recebida", req.url);
    const auth = autenticarTicket(req);

    if (!auth) {
      ws.close(1008, "não autenticado");
      return;
    }

    const tenantId = String(auth.tenantId);

    // Registra o cliente
    if (!clientes[tenantId]) clientes[tenantId] = new Set();
    clientes[tenantId].add(ws);

    console.log(`[WS] cliente conectado tenant=${tenantId} total=${clientes[tenantId].size}`);

    // Manda o estado atual imediatamente ao conectar
    const estadoAtual = estadoRamais[tenantId] ?? {};
    console.log(
  "[WS] ESTADO_INICIAL tenant=",
  tenantId,
  JSON.stringify(estadoRamais[tenantId] ?? {}, null, 2)
);
    ws.send(JSON.stringify({ tipo: "ESTADO_INICIAL", ramais: estadoAtual, ts: Date.now() }));

    ws.on("close", (code, reason) => {
      clientes[tenantId]?.delete(ws);
  console.log("[WS] ===== CONEXÃO FECHADA =====");
  console.log("[WS] tenant:", tenantId);
  console.log("[WS] code:", code);
  console.log("[WS] reason:", reason?.toString());
  console.log("[WS] readyState:", ws.readyState);
  console.log("[WS] time:", new Date().toISOString());
  console.log("[WS] ===========================");
    });

    ws.on("error", (err) => {
  console.error("[WS] ===== ERRO WEBSOCKET =====");
  console.error("[WS] tenant:", tenantId);
  console.error("[WS] erro:", err);
  console.error("[WS] time:", new Date().toISOString());
  console.error("[WS] ==========================");
    });
  });

  console.log("[WS] WebSocket de ramais iniciado em /ws/ramais");
  return wss;
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function iniciarMonitor(ariClient, httpServer, queryFn) {
  registrarEventos(ariClient, queryFn);

  await inicializarRamaisOnline(ariClient, queryFn);

  iniciarWebSocket(httpServer);

  console.log("[MONITOR] monitoramento de ramais ativo");
}

module.exports = { iniciarMonitor, estadoRamais, publicar };
