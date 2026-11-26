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
const logger = require("./utils/logger");

// ─── Estado em memória ────────────────────────────────────────────────────────
// { [tenant_id]: { [endpoint]: { state, numero, linkedid, desde } } }
const estadoRamais = {};

// Presença real dos endpoints no Asterisk.
// Não é enviado ao frontend.
const presencaRamais = {};

// ─── Clientes WebSocket conectados ────────────────────────────────────────────
// { [tenant_id]: Set<WebSocket> }
const clientes = {};

// Evita criar vários WebSocketServers no mesmo servidor HTTP.
const webSocketsPorServidor = new WeakMap();

// Evita registrar os mesmos eventos ARI mais de uma vez.
const inicializacoesPorAri = new WeakMap();

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
function removerIdentificadorCanal(nome = "") {
  return String(nome).trim().replace(/^PJSIP\//i, "").split("@")[0].replace(/-[0-9a-f]+$/i, "");
}

// Converte endpoint físico/canal em ramal lógico: 19999-web -> 19999.
function normalizarEndpoint(nome = "") {
  return removerIdentificadorCanal(nome).replace(/-(web|mobile)$/i, "");
}

function tipoDispositivo(nome = "") {
  const recurso = removerIdentificadorCanal(nome);
  if (/-mobile$/i.test(recurso)) return "mobile";
  if (/-web$/i.test(recurso)) return "web";
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
  const nome = String(nomeCanal);
  if (!/^PJSIP\//i.test(nome)) return null;
  return normalizarEndpoint(nome) || null;
}

// Normaliza o número discado para publicação no monitor.
function limparNumeroDiscado(valor = "") {
  const numero = String(valor).trim();

  if (!numero || numero === "s") return null;

  const limpo = numero
    .replace(/^PJSIP\//i, "")
    .split("@")[0]
    .replace(/-[0-9a-f]+$/i, "");

  return /^\+?\d{1,20}$/.test(limpo) ? limpo : null;
}

// Um canal ativo prova que o dispositivo físico está presente.
// O estado continua indexado pelo ramal lógico no frontend.
function marcarPresencaDoCanal(tenantId, nomeCanal) {
  if (!tenantId || !nomeCanal) return null;
  const endpoint = normalizarEndpoint(nomeCanal);
  if (!endpoint) return null;
  const presenca = garantirPresenca(tenantId, endpoint);
  presenca[tipoDispositivo(nomeCanal)] = true;
  return endpoint;
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

  logger.debug(
    `[MONITOR] Custom:${endpoint} -> ${estado} ` +
    `(base=${presenca.base ? "online" : "offline"}, ` +
    `web=${presenca.web ? "online" : "offline"}, ` +
    `mobile=${presenca.mobile ? "online" : "offline"})`
  );
  } catch (err) {
    logger.error(`[MONITOR] erro atualizando Custom:${endpoint}:`, err.message || err);
  }
}

// ─── Publicar evento pro front ────────────────────────────────────────────────

function enviarWebSocket(ws, mensagem, tenantId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(mensagem, (err) => {
      if (!err) return;

      logger.warn(
        `[WS] falha ao enviar mensagem para tenant=${tenantId}:`,
        err.message || err
      );

      // Não mantém uma conexão com falha na lista de clientes.
      clientes[tenantId]?.delete(ws);
    });

    return true;
  } catch (err) {
    logger.warn(
      `[WS] erro síncrono ao enviar para tenant=${tenantId}:`,
      err.message || err
    );

    clientes[tenantId]?.delete(ws);
    return false;
  }
}

function publicar(tenantId, tipo, payload) {
  const tenantKey = String(tenantId);
  const mensagem = JSON.stringify({
    tipo,
    ...payload,
    ts: Date.now(),
  });

  const alvos = clientes[tenantKey];

  if (!alvos || alvos.size === 0) {
    logger.debug(
      `[WS][publicar] sem clientes: tenant=${tenantKey}, tipo=${tipo}, endpoint=${payload?.endpoint ?? "-"}, state=${payload?.state ?? "-"}`
    );
    return;
  }

  let abertos = 0;
  let enviados = 0;
  let removidos = 0;

  for (const ws of alvos) {
    if (ws.readyState !== WebSocket.OPEN) {
      alvos.delete(ws);
      removidos++;
      continue;
    }

    abertos++;
    if (enviarWebSocket(ws, mensagem, tenantKey)) {
      enviados++;
    } else {
      removidos++;
    }
  }

  logger.debug(
    `[WS][publicar] tenant=${tenantKey}, tipo=${tipo}, endpoint=${payload?.endpoint ?? "-"}, state=${payload?.state ?? "-"}, clientes=${alvos.size + removidos}, abertos=${abertos}, enviados=${enviados}, removidos=${removidos}`
  );
}

// ─── Atualizar estado e notificar ─────────────────────────────────────────────

function atualizarEstado(tenantId, endpoint, dados) {
  if (!tenantId || !endpoint) return;

  const presenca = presencaRamais[tenantId]?.[endpoint];

  if (!estaOnline(presenca)) {
    logger.warn(`[MONITOR] atualização bloqueada: lógico=${endpoint}, tenant=${tenantId}, sem presença online`);
    return;
  }

  if (!estadoRamais[tenantId]) estadoRamais[tenantId] = {};

  const anterior = estadoRamais[tenantId][endpoint] ?? {};
  estadoRamais[tenantId][endpoint] = { ...anterior, ...dados };

  logger.debug(`[MONITOR] estado atualizado: tenant=${tenantId}, lógico=${endpoint}, state=${estadoRamais[tenantId][endpoint].state}`);

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

        // A reconciliação pode acontecer com dashboards já conectados.
        // Como o estado em memória foi reconstruído, avisamos que este ramal
        // não está presente para remover qualquer estado antigo no frontend.
        publicar(tenantId, "RAMAL_REMOVIDO", { endpoint });
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

      // Atualiza também os dashboards que já estavam conectados antes
      // da inicialização/reconexão terminar.
      publicar(tenantId, "RAMAL_STATUS", {
        endpoint,
        ...estadoRamais[tenantId][endpoint],
      });

      online++;
    }

    // Atualiza o Custom:XXXX conforme a presença reconstruída.
    for (const row of rows) {
      const endpoint = String(row.endpoint_id);
      const tenantId = row.tenant_id;

      await atualizarDisponibilidadeAgente(tenantId, endpoint);
    }

    logger.info(
      `[MONITOR] inicialização concluída: ${online} ramais online, ${offline} ramais offline`,
    );
  } catch (err) {
    logger.error("[MONITOR] erro ao inicializar ramais:", err);
  }
}

// Reconstrói as chamadas que continuam ativas no Asterisk.
// Isso cobre eventos perdidos enquanto o WebSocket ARI esteve desconectado.
async function reconciliarChamadasAtivas(ariClient, queryFn) {
  const [rows] = await queryFn(
    `SELECT endpoint_id, tenant_id
     FROM ramais
     WHERE endpoint_id IS NOT NULL`
  );

  const tenantPorEndpoint = new Map(
    rows.map((row) => [String(row.endpoint_id), row.tenant_id])
  );

  const canais = await ariClient.channels.list();
  const ramaisComChamada = new Set();

  // A fotografia de canais é a fonte de verdade após uma reconexão.
  for (const canal of canais) {
    const endpoint = extrairEndpoint(canal?.name);
    if (!endpoint) continue;

    const tenantId = tenantPorEndpoint.get(endpoint);
    if (!tenantId) continue;

    const estadoMap = {
      Ring: "RING",
      Ringing: "RINGING",
      Up: "IN_CALL",
    };
    const state = estadoMap[canal.state];
    if (!state) continue;

    const exten = canal.dialplan?.exten;
    const caller = canal.caller?.number;
    const connected = canal.connected?.number;

    // Em chamadas de saída, o exten costuma ser o destino.
    // Em chamadas recebidas, o exten costuma ser o próprio ramal;
    // nesse caso usamos o número de quem originou/está conectado.
    let numero = null;
    if (exten && exten !== "s" && String(exten) !== endpoint) {
      numero = String(exten);
    } else if (caller && String(caller) !== "s" && String(caller) !== endpoint) {
      numero = String(caller);
    } else if (connected && String(connected) !== endpoint) {
      numero = String(connected);
    }

    ramaisComChamada.add(`${tenantId}:${endpoint}`);

    const dados = {
      endpoint,
      state,
      numero: numero || null,
      linkedid: canal.id || null,
    };

    if (state === "IN_CALL") {
      dados.desde = estadoRamais[tenantId]?.[endpoint]?.desde || new Date().toISOString();
    }

    atualizarEstado(tenantId, endpoint, dados);
  }

  // Limpa estados de chamada que ficaram em memória, mas já não existem no Asterisk.
  for (const row of rows) {
    const endpoint = String(row.endpoint_id);
    const tenantId = row.tenant_id;
    const chave = `${tenantId}:${endpoint}`;
    const estadoAtual = estadoRamais[tenantId]?.[endpoint];

    if (!estadoAtual || ramaisComChamada.has(chave)) continue;

    if (estadoAtual.state && estadoAtual.state !== "IDLE") {
      limparEstado(tenantId, endpoint);
    }
  }

  logger.info(
    `[MONITOR] reconciliação de chamadas concluída: ${ramaisComChamada.size} canais de ramais ativos encontrados.`
  );
}

async function reconciliarEstadoRamais(ariClient, queryFn) {
  await inicializarRamaisOnline(ariClient, queryFn);
  await reconciliarChamadasAtivas(ariClient, queryFn);
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

  logger.debug(
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

      logger.debug(
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

        logger.debug(
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

      logger.debug(
        `[MONITOR] desconexão total: ${endpointBase}`
      );
    } catch (err) {
      logger.error(
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

    logger.debug(`[MONITOR][Dial] caller=${callerStr || "-"} => lógico=${callerEndpoint || "-"}; peer=${peerStr || "-"} => lógico=${peerEndpoint || "-"}; status=${event.dialstatus || "INICIANDO"}`);

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
        marcarPresencaDoCanal(tenantId, callerStr);
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
          // Uma chamada pode tocar em várias pernas em paralelo (ex.: Web + mobile).
          // O encerramento de uma perna Local não encerra a chamada lógica do ramal.
          // Mantém o estado atual até outra perna atender ou o canal do ramal terminar.
          const falhaDePernaLocal =
            /^Local\//i.test(peerStr) &&
            ["CANCEL", "BUSY", "NOANSWER", "CONGESTION", "CHANUNAVAIL"].includes(dialstatus);

          if (!falhaDePernaLocal) {
            const state = stateMap[dialstatus] ?? "IDLE";
            atualizarEstado(tenantId, callerEndpoint, {
              state,
              ...(state === "IN_CALL" ? { desde: new Date().toISOString() } : {}),
            });
          } else {
            logger.debug(
              `[MONITOR][Dial] ignorando ${dialstatus} da perna Local para caller lógico=${callerEndpoint}; aguardando demais pernas`
            );
          }
        }
      }
    }

    if (peerEndpoint && !isTroncoPeer) {
      const tenantId = await resolverTenant(peerEndpoint, queryFn);
      if (tenantId) {
        marcarPresencaDoCanal(tenantId, peerStr);
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
    if (!tenantId) {
      logger.warn(`[MONITOR][ChannelStateChange] lógico=${endpoint} não encontrado no banco; canal=${canal?.name}`);
      return;
    }

    marcarPresencaDoCanal(tenantId, canal.name);

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
  const existente = webSocketsPorServidor.get(httpServer);

  if (existente) {
    return existente;
  }

  const wss = new WebSocketServer({ noServer: true });

  // Registra imediatamente para impedir inicializações concorrentes.
  webSocketsPorServidor.set(httpServer, wss);

  httpServer.on("upgrade", (req, socket, head) => {
    let path;

    try {
      path = new URL(req.url, "http://localhost").pathname;
    } catch {
      return;
    }

    if (path !== "/ws/ramais") return;

    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      logger.error("[WS] erro durante handshake:", err.message || err);

      if (!socket.destroyed) {
        socket.destroy();
      }
    }
  });

  wss.on("connection", (ws, req) => {
    logger.debug("[WS] tentativa de conexão recebida");

    const auth = autenticarTicket(req);

    if (!auth) {
      ws.close(1008, "não autenticado");
      return;
    }

    const tenantId = String(auth.tenantId);

    if (!clientes[tenantId]) {
      clientes[tenantId] = new Set();
    }

    clientes[tenantId].add(ws);

    logger.debug(
      `[WS] cliente conectado tenant=${tenantId} total=${clientes[tenantId].size}`
    );

    const estadoAtual = estadoRamais[tenantId] ?? {};

    enviarWebSocket(
      ws,
      JSON.stringify({
        tipo: "ESTADO_INICIAL",
        ramais: estadoAtual,
        ts: Date.now(),
      }),
      tenantId
    );

    ws.on("close", (code, reason) => {
      clientes[tenantId]?.delete(ws);

      logger.debug("[WS] ===== CONEXÃO FECHADA =====");
      logger.debug("[WS] tenant:", tenantId);
      logger.debug("[WS] code:", code);
      logger.debug("[WS] reason:", reason?.toString());
      logger.debug("[WS] ===========================");
    });

    ws.on("error", (err) => {
      clientes[tenantId]?.delete(ws);

      logger.error("[WS] ===== ERRO WEBSOCKET =====");
      logger.error("[WS] tenant:", tenantId);
      logger.error("[WS] erro:", err.message || err);
      logger.error("[WS] time:", new Date().toISOString());
      logger.error("[WS] ==========================");
    });
  });

  wss.on("error", (err) => {
    logger.error("[WS] erro no servidor WebSocket:", err.message || err);
  });

  logger.info("[WS] WebSocket de ramais iniciado em /ws/ramais");

  return wss;
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function iniciarMonitor(ariClient, httpServer, queryFn) {
  // O WebSocket HTTP é inicializado uma única vez por servidor.
  iniciarWebSocket(httpServer);

  // Se esse cliente ARI já foi inicializado, reutiliza a inicialização.
  const inicializacaoExistente = inicializacoesPorAri.get(ariClient);

  if (inicializacaoExistente) {
    logger.debug("[MONITOR] cliente ARI já inicializado; evitando duplicidade.");
    return inicializacaoExistente;
  }

  const inicializacao = (async () => {
    registrarEventos(ariClient, queryFn);

    logger.info("[MONITOR] WebSocket de ramais ativo");

    await reconciliarEstadoRamais(ariClient, queryFn);

    logger.info("[MONITOR] monitoramento de ramais ativo");
  })();

  inicializacoesPorAri.set(ariClient, inicializacao);

  return inicializacao;
}

module.exports = { iniciarMonitor, reconciliarEstadoRamais, estadoRamais, publicar };
