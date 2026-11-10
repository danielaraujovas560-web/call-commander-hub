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

// Presença real dos endpoints no Asterisk.
// Não é enviado ao frontend.
const presencaRamais = {};

// ─── Clientes WebSocket conectados ────────────────────────────────────────────
// { [tenant_id]: Set<WebSocket> }
const clientes = {};

//-- Ramais em memória para conexão e desconexão --------
const offlineTimers = new Map();

const presencaVersoes = new Map();

function novaVersaoPresenca(chave) {
  const versao = (presencaVersoes.get(chave) ?? 0) + 1;
  presencaVersoes.set(chave, versao);
  return versao;
}

function versaoAtual(chave, versao) {
  return presencaVersoes.get(chave) === versao;
}

// -- Binas entrada e saída -------
const extensDiscadas = new Map();
const binasAtivos = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extrai o endpoint do nome do canal.
 * "PJSIP/19999-000002c1" → "19999"
 */
function normalizarEndpoint(nome = "") {
  return String(nome).replace(/-(web|mobile)$/, "");
}

function tipoDispositivo(nome = "") {
  if (nome.endsWith("-mobile")) return "mobile";
  if (nome.endsWith("-web")) return "web";
  return "base";
}

function estaOnline(presenca) {
  return Boolean(
    presenca?.base ||
    presenca?.web ||
    presenca?.mobile
  );
}

function extrairEndpoint(nomeCanal = "") {
  const match = String(nomeCanal).match(
    /^PJSIP\/(.+)-[0-9a-f]+$/i
  );

  if (!match) return null;

  return normalizarEndpoint(match[1]);
}

function garantirPresenca(tenantId, endpointBase) {
  if (!presencaRamais[tenantId]) {
    presencaRamais[tenantId] = {};
  }

  if (!presencaRamais[tenantId][endpointBase]) {
    presencaRamais[tenantId][endpointBase] = {
      base: false,
      web: false,
      mobile: false,
    };
  }

  return presencaRamais[tenantId][endpointBase];
}

/**
 * Retorna o tenant_id do endpoint consultando o banco.
 * Injeta a função de query para não acoplar ao pool aqui.
 */
async function resolverTenant(endpoint, queryFn) {
  if (!endpoint) return null;
  try {
    const [rows] = await queryFn("SELECT tenant_id FROM ramais WHERE endpoint_id = ? LIMIT 1", [
      endpoint,
    ]);
    return rows[0]?.tenant_id ?? null;
  } catch {
    return null;
  }
}

//Função para disparar o custom:{endpoint} para o AMI
async function atualizarDisponibilidadeAgente(tenantId, endpoint) {
  if (!tenantId || !endpoint) return;

  const presenca = garantirPresenca(tenantId, endpoint);

  const estado = estaOnline(presenca) ? "NOT_INUSE" : "UNAVAILABLE";

  try {
    await setCustomDeviceState(endpoint, estado);

  console.log(
    `[MONITOR] Custom:${endpoint} -> ${estado} ` +
    `(base=${presenca.base ? "online" : "offline"}, ` +
    `web=${presenca.web ? "online" : "offline"}, ` +
    `mobile=${presenca.mobile ? "online" : "offline"})`
  );
  } catch (err) {
    console.error(`[MONITOR] erro atualizando Custom:${endpoint}:`, err.message || err);
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

  const presenca = presencaRamais[tenantId]?.[endpoint];

  if (!estaOnline(presenca)) {
    console.log(
      `[MONITOR] ignorando atualização de ${endpoint}: sem presença online`
    );
    return;
  }

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
       WHERE endpoint_id IS NOT NULL`,
    );

    const endpoints = await ariClient.endpoints.list();

    // Mapa dos ramais existentes no banco.
    // endpoint_id -> tenant_id
    const ramaisPorEndpoint = new Map();

    for (const row of rows) {
      ramaisPorEndpoint.set(String(row.endpoint_id), row.tenant_id);
    }

    // Limpa os estados anteriores.
    for (const tenantId of Object.keys(estadoRamais)) {
      estadoRamais[tenantId] = {};
    }

    for (const tenantId of Object.keys(presencaRamais)) {
      delete presencaRamais[tenantId];
    }

    // Reconstrói a presença real a partir do Asterisk.
    for (const endpoint of endpoints) {
      const nome = endpoint.resource;

      if (!nome) continue;
      if (endpoint.technology !== "PJSIP") continue;
      if (endpoint.state !== "online") continue;

      const endpointBase = normalizarEndpoint(nome);
      const tenantId = ramaisPorEndpoint.get(endpointBase);

      if (!tenantId) continue;

      const presenca = garantirPresenca(tenantId, endpointBase);

      presenca[tipoDispositivo(nome)] = true;
    }

    let online = 0;
    let offline = 0;

    // Reconstrói o estado lógico dos ramais.
    for (const row of rows) {
      const endpoint = String(row.endpoint_id);
      const tenantId = row.tenant_id;

      const presenca = garantirPresenca(tenantId, endpoint);

      if (!estaOnline(presenca)) {
        offline++;
        continue;
      }

      if (!estadoRamais[tenantId]) {
        estadoRamais[tenantId] = {};
      }

      let registradoDesde = row.registrado_desde;

      if (!registradoDesde) {
        await queryFn(
          `UPDATE ramais
           SET registrado_desde = NOW()
           WHERE endpoint_id = ?`,
          [endpoint],
        );

        const [[ramalAtualizado]] = await queryFn(
          `SELECT registrado_desde
           FROM ramais
           WHERE endpoint_id = ?
           LIMIT 1`,
          [endpoint],
        );

        registradoDesde = ramalAtualizado?.registrado_desde;
      }

      estadoRamais[tenantId][endpoint] = {
        endpoint,
        state: "IDLE",
        numero: null,
        linkedid: null,
        desde: null,
        conectadoDesde: registradoDesde ? new Date(registradoDesde).toISOString() : null,
      };

      online++;
    }

    // Atualiza o Custom:XXXX conforme a presença reconstruída.
    for (const row of rows) {
      const endpoint = String(row.endpoint_id);
      const tenantId = row.tenant_id;

      await atualizarDisponibilidadeAgente(tenantId, endpoint);
    }

    console.log(
      `[MONITOR] inicialização concluída: ${online} ramais online, ${offline} ramais offline`,
    );
  } catch (err) {
    console.error("[MONITOR] erro ao inicializar ramais:", err);
  }
}

// ─── Registrar eventos ARI + Função ultima conexão no banco ───────────────────────────────────
function registrarEventos(ariClient, queryFn) {
  // Registro/desregistro do ramal
ariClient.on("ContactStatusChange", async (event) => {
  const endpoint = event.endpoint;

  if (!endpoint?.resource) return;
  if (endpoint.technology !== "PJSIP") return;

  const nome = endpoint.resource;
  const endpointBase = normalizarEndpoint(nome);

  const tenantId = await resolverTenant(endpointBase, queryFn);
  if (!tenantId) return;

  console.log(
    `[MONITOR] EVENTO ENDPOINT: ${nome} PJSIP ${endpoint.state}`
  );

  const chave = `${tenantId}:${endpointBase}`;

  const versao = novaVersaoPresenca(chave);

  // Cancela a verificação anterior deste ramal lógico.
  const anterior = offlineTimers.get(chave);

  if (anterior) {
    clearTimeout(anterior);
    offlineTimers.delete(chave);
  }

  // Reconcilia os três dispositivos após estabilizar os eventos.
  const timer = setTimeout(async () => {
    offlineTimers.delete(chave);

    try {
      const endpoints = await ariClient.endpoints.list();

      if (!versaoAtual(chave, versao)) return;

      const dispositivos = {
        base: false,
        web: false,
        mobile: false,
      };

      for (const item of endpoints) {
        if (item.technology !== "PJSIP") continue;
        if (item.state !== "online") continue;

        const nomeAtual = item.resource;
        if (!nomeAtual) continue;

        if (normalizarEndpoint(nomeAtual) !== endpointBase) {
          continue;
        }

        dispositivos[tipoDispositivo(nomeAtual)] = true;
      }

      const presenca = garantirPresenca(tenantId, endpointBase);

      presenca.base = dispositivos.base;
      presenca.web = dispositivos.web;
      presenca.mobile = dispositivos.mobile;

      const online = estaOnline(presenca);

      console.log(
        `[MONITOR] PRESENÇA ${endpointBase}: ` +
        `base=${presenca.base}, ` +
        `web=${presenca.web}, ` +
        `mobile=${presenca.mobile}`
      );

      if (online) {
        const [[ramal]] = await queryFn(
          `SELECT registrado_desde
           FROM ramais
           WHERE tenant_id = ?
             AND endpoint_id = ?
           LIMIT 1`,
          [tenantId, endpointBase]
        );

        let registradoDesde = ramal?.registrado_desde;

        if (!registradoDesde) {
          await queryFn(
            `UPDATE ramais
             SET registrado_desde = NOW()
             WHERE tenant_id = ?
               AND endpoint_id = ?`,
            [tenantId, endpointBase]
          );

          const [[atualizado]] = await queryFn(
            `SELECT registrado_desde
             FROM ramais
             WHERE tenant_id = ?
               AND endpoint_id = ?
             LIMIT 1`,
            [tenantId, endpointBase]
          );

          registradoDesde = atualizado?.registrado_desde;
        }

        const estadoAnterior =
          estadoRamais[tenantId]?.[endpointBase] ?? {};

        atualizarEstado(tenantId, endpointBase, {
          endpoint: endpointBase,
          state: estadoAnterior.state ?? "IDLE",
          numero: estadoAnterior.numero ?? null,
          linkedid: estadoAnterior.linkedid ?? null,
          desde: estadoAnterior.desde ?? null,
          conectadoDesde: registradoDesde
            ? new Date(registradoDesde).toISOString()
            : null,
        });

        await atualizarDisponibilidadeAgente(
          tenantId,
          endpointBase
        );

        console.log(
          `[MONITOR] ramal conectado: ${endpointBase}`
        );

        return;
      }

      // Nenhum dos três dispositivos está online.
      await queryFn(
        `UPDATE ramais
         SET registrado_desde = NULL,
             ultima_conexao = NOW()
         WHERE tenant_id = ?
           AND endpoint_id = ?
           AND registrado_desde IS NOT NULL`,
        [tenantId, endpointBase]
      );

      delete estadoRamais[tenantId]?.[endpointBase];

      await atualizarDisponibilidadeAgente(
        tenantId,
        endpointBase
      );

      publicar(tenantId, "RAMAL_REMOVIDO", {
        endpoint: endpointBase,
      });

      console.log(
        `[MONITOR] desconexão total: ${endpointBase}`
      );
    } catch (err) {
      console.error(
        `[MONITOR] erro reconciliando ${endpointBase}:`,
        err
      );
    }
  }, endpoint.state === "offline" ? 3000 : 500);

  offlineTimers.set(chave, timer);
});

  // Canal criado — ramal iniciou discagem ou está recebendo chamada
  ariClient.on("ChannelCreated", async (event) => {
    const canal = event.channel;

    const callerNum = canal.caller?.number;
    if (callerNum && callerNum !== "s") {
      binasAtivos.set(canal.id, callerNum);
    }

    // 2. Chamada de Saída: se for um ramal interno discando, salva o exten exatamente como foi digitado
    const exten = canal.dialplan?.exten;
    if (exten && exten !== "s") {
      extensDiscadas.set(canal.id, exten);
      extensDiscadas.set(canal.name, exten);
    }

    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) return;

    if (canal.dialplan?.context !== "Internal-default") return;

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    const stateMap = {
      Ring: "RING",
      Ringing: "RINGING",
      Up: "IN_CALL",
      Down: "IDLE",
    };

    const state = stateMap[canal.state] ?? "IDLE";

    atualizarEstado(tenantId, endpoint, {
      state,
      ...(exten && exten !== "s" ? { numero: exten } : {}),
      linkedid: canal.id,
    });
  });

  // Dial — captura o número discado e o progresso
  ariClient.on("Dial", async (event) => {
    const callerStr = typeof event.caller === "string" ? event.caller : (event.caller?.name ?? "");
    const peerStr = typeof event.peer === "string" ? event.peer : (event.peer?.name ?? "");

    const callerEndpoint = extrairEndpoint(callerStr);
    const peerEndpoint = extrairEndpoint(peerStr);

    const isTroncoCaller = callerStr.includes("t1-") || callerStr.includes("Tronco");
    const isTroncoPeer = peerStr.includes("t1-") || peerStr.includes("Tronco");

    const dialstatus = event.dialstatus ?? "";

    const stateMap = {
      ANSWER: "IN_CALL",
      PROGRESS: "RINGING",
      RINGING: "RINGING",
      CANCEL: "IDLE",
      BUSY: "IDLE",
      NOANSWER: "IDLE",
      CONGESTION: "IDLE",
      CHANUNAVAIL: "IDLE",
    };

    if (callerEndpoint && !isTroncoCaller) {
      const tenantId = await resolverTenant(callerEndpoint, queryFn);
      if (tenantId) {
        const callerId = typeof event.caller === "object" ? event.caller?.id : null;
        const numeroDiscado =
          (callerId && extensDiscadas.get(callerId)) ||
          extensDiscadas.get(callerStr) ||
          limparNumeroDiscado(event.dialstring || peerEndpoint);

        if (dialstatus === "") {
          atualizarEstado(tenantId, callerEndpoint, {
            state: "DIALING",
            ...(numeroDiscado ? { numero: numeroDiscado } : {}),
          });
        } else {
          const state = stateMap[dialstatus] ?? "IDLE";
          atualizarEstado(tenantId, callerEndpoint, {
            state,
            ...(state === "IN_CALL" ? { desde: new Date().toISOString() } : {}),
          });
        }
      }
    }

    if (peerEndpoint && !isTroncoPeer) {
      const tenantId = await resolverTenant(peerEndpoint, queryFn);
      if (tenantId) {
        let numeroChamador = null;

        if (isTroncoCaller) {
          const callerId = typeof event.caller === "object" ? event.caller?.id : null;
          numeroChamador = (callerId && binasAtivos.get(callerId)) || event.caller?.number || null;
        } else if (callerEndpoint) {
          numeroChamador = callerEndpoint;
        }
        if (dialstatus === "") {
          // Ramal está tocando
          atualizarEstado(tenantId, peerEndpoint, {
            state: "RINGING",
            ...(numeroChamador && numeroChamador !== "s" ? { numero: numeroChamador } : {}),
          });
        } else {
          // Mudança de estado no atendimento do ramal
          const state = stateMap[dialstatus] ?? "IDLE";
          atualizarEstado(tenantId, peerEndpoint, {
            state,
            ...(state === "IN_CALL" ? { desde: new Date().toISOString() } : {}),
          });
        }
      }
    }
  });

  // Mudança de estado do canal (Ringing, Up, etc.)
  ariClient.on("ChannelStateChange", async (event) => {
    const canal = event.channel;
    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) return;
    if (canal.name.includes("t1-") || canal.name.includes("Tronco")) return;

    const tenantId = await resolverTenant(endpoint, queryFn);
    if (!tenantId) return;

    const stateMap = {
      Ring: "RING",
      Ringing: "RINGING",
      Up: "IN_CALL",
      Down: "IDLE",
    };

    const state = stateMap[canal.state];
    if (state) atualizarEstado(tenantId, endpoint, { state });
  });

  // Canal destruído — chamada encerrada
  ariClient.on("ChannelDestroyed", async (event) => {
    const canal = event.channel;
    if (canal.id) {
      binasAtivos.delete(canal.id);
      extensDiscadas.delete(canal.id);
    }
    if (canal.name) extensDiscadas.delete(canal.name);
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

    if (payload.type !== "ramal_ws" || !payload.sub || !payload.tenant_id) {
      return null;
    }

    return {
      userId: payload.sub,
      tenantId: String(payload.tenant_id),
    };
  } catch {
    return null;
  }
}

function iniciarWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/ramais" });

  wss.on("connection", (ws, req) => {
    // Front passa o tenant_id na query string: /ws/ramais?tenant_id=1
    console.log("[WS] tentativa de conexão recebida");
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
      JSON.stringify(estadoRamais[tenantId] ?? {}, null, 2),
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

  iniciarWebSocket(httpServer);

  console.log("[MONITOR] WebSocket de ramais ativo");

  await inicializarRamaisOnline(ariClient, queryFn);

  console.log("[MONITOR] monitoramento de ramais ativo");
}

module.exports = { iniciarMonitor, estadoRamais, publicar };
