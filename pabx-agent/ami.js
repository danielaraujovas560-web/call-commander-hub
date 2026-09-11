// ami.js — cliente AMI (Asterisk Manager Interface) para status de endpoints.
// Substitui "asterisk -rx pjsip show endpoints" por uma conexão AMI persistente.

const AsteriskManager = require("asterisk-manager");
const { ensureChain, restoreBlacklist, handleAuthFailure, resetAuthFailures, normalizeIp } = require("./firewall");

const {
  AMI_HOST = "127.0.0.1",
  AMI_PORT = "5038",
  AMI_USER,
  AMI_PASSWORD,
} = process.env;

if (!AMI_USER || !AMI_PASSWORD) {
  console.error("AMI_USER/AMI_PASSWORD ausentes no .env — status via AMI não vai funcionar.");
}

const ami = new AsteriskManager(Number(AMI_PORT), AMI_HOST, AMI_USER, AMI_PASSWORD, true);
ami.keepConnected(); // reconecta sozinho se a conexão cair

let _amiConnected = false;
let _onConnect = null;
ami.on("connect", async () => {
  _amiConnected = true;
  console.log("[ami] conectado");
  try {
    await ensureChain();
    await restoreBlacklist();
  } catch (err) {
    console.error(
      "[firewall] erro inicializando firewall:",
      err.message || err
    );
  }
  if (_onConnect) {
    Promise.resolve()
      .then(() => _onConnect())
      .catch((err) => {
        console.error("[ami] erro no callback de conexão:", err.message || err);
      });
  }
});
ami.on("error", (err) => {
  _amiConnected = false;
  console.error("[ami] erro:", err.message || err);
});

function onAmiConnect(callback) {
  _onConnect = callback;
}

// Indica se a conexão AMI está ativa no momento (usado para health checks).
function amiReady() {
  return _amiConnected;
}

/**
 * Executa um comando de CLI via AMI (Action: Command) — substitui o antigo
 * `asterisk -rx "<cmd>"`. Usado para "pjsip reload" e "queue reload all".
 */
function amiCommand(cmd, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout aguardando resposta do AMI (Command: ${cmd})`));
    }, timeoutMs);
    ami.action({ action: "Command", command: cmd }, (err, res) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(res);
    });
  });
}

let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  return `pabx-${Date.now()}-${actionCounter}`;
}

/**
 * Executa PJSIPShowEndpoints via AMI e retorna { objectName: deviceState }.
 * deviceState vem no formato do Asterisk: NOT_INUSE, INUSE, BUSY,
 * UNAVAILABLE, RINGING, ONHOLD, UNKNOWN, INVALID.
 */
function getEndpointsDeviceState(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const actionId = nextActionId();
    const map = {};
    let settled = false;

    const onEvent = (evt) => {
      const evtActionId = evt.actionid || evt.ActionID;
      if (evtActionId !== actionId) return;
      const name = evt.event || evt.Event;

      if (name === "EndpointList") {
        const objectName = evt.objectname || evt.ObjectName;
        const deviceState = evt.devicestate || evt.DeviceState || "UNKNOWN";
        if (objectName) map[objectName] = deviceState;
      } else if (name === "EndpointListComplete") {
        cleanup();
        resolve(map);
      }
    };

    function cleanup() {
      if (settled) return;
      settled = true;
      ami.removeListener("managerevent", onEvent);
      clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout aguardando resposta do AMI (PJSIPShowEndpoints)"));
    }, timeoutMs);

    ami.on("managerevent", onEvent);

    ami.action({ action: "PJSIPShowEndpoints", actionid: actionId }, (err) => {
      if (err) {
        cleanup();
        reject(err);
      }
      // A resposta imediata só confirma que a action foi aceita.
      // Os dados de verdade chegam via eventos "EndpointList"/"EndpointListComplete".
    });
  });
}

// Helper genérico para actions AMI simples (request/response único).
function amiAction(action, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout aguardando resposta do AMI (${action.action})`));
    }, timeoutMs);
    ami.action(action, (err, res) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(res);
    });
  });
}

// Adiciona um agente numa fila em tempo real (efeito imediato, sem reload).
function queueAdd({ queue, interface: iface, penalty, memberName }) {
  const action = { action: "QueueAdd", queue, interface: iface };
  if (penalty != null) action.penalty = String(penalty);
  if (memberName) action.membername = memberName;
  return amiAction(action);
}

// Remove um agente de uma fila em tempo real.
function queueRemove({ queue, interface: iface }) {
  return amiAction({ action: "QueueRemove", queue, interface: iface });
}

// Atualiza a prioridade (penalty) de um agente já na fila, sem remover/readicionar.
function queuePenalty({ queue, interface: iface, penalty }) {
  const action = { action: "QueuePenalty", interface: iface, penalty: String(penalty) };
  if (queue) action.queue = queue;
  return amiAction(action);
}

function queueRefresh(queue) {
  return amiCommand(`queue show ${queue}`);
}

function getQueueStatus(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const activeMembers = new Set();
    let settled = false;

    function onQueueMember(evt) {
      // asterisk-manager sempre entrega chaves em letras minúsculas
      const queue = evt.queue;
      const iface = evt.interface || evt.location; // Fallback de segurança para versões do Asterisk

      if (queue && iface) {
        // Padroniza TUDO para minúsculo para cruzar os dados com perfeição
        activeMembers.add(`${queue.toLowerCase()}|${iface.toLowerCase()}`);
      }
    }

    function onQueueStatusComplete() {
      cleanup();
      resolve(activeMembers);
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      ami.removeListener("queuemember", onQueueMember);
      ami.removeListener("queuestatuscomplete", onQueueStatusComplete);
      clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve(activeMembers); // Se der timeout, retorna o que já conseguiu ler
    }, timeoutMs);

    ami.on("queuemember", onQueueMember);
    ami.on("queuestatuscomplete", onQueueStatusComplete);

    ami.action({ action: "QueueStatus" }, (err) => {
      if (err) {
        cleanup();
        resolve(activeMembers);
      }
    });
  });
}

// Aqui será a regra para o firewall

ami.on("managerevent", async (event) => {
  const nome = event.event || event.Event;
  if (nome === "ContactStatus") {
    const status = event.contactstatus || event.ContactStatus;

    if (status === "Reachable") {
      const endpoint =
        event.endpointname ||
        event.EndpointName ||
        event.aor ||
        event.AOR;

      const uri = event.uri || event.URI;

      const match = String(uri || "").match(
        /^sip:[^@]+@([^:;]+)/
      );

      const ip = match ? match[1] : null;

      if (endpoint && ip) {
        registerReachableContact(endpoint, ip);
      }
    }

    return;
  }

  if (nome === "PeerStatus") {
    const status = event.peerstatus || event.PeerStatus;

    if (status === "Reachable") {
      const channelType =
        event.channeltype ||
        event.ChannelType;

      if (channelType && String(channelType).toUpperCase() !== "PJSIP") {
        return;
      }

      const peer = event.peer || event.Peer;
      const match = String(peer || "").match(/^PJSIP\/(.+)$/);

      if (match) {
        const endpoint = match[1];
        registerReachablePeer(endpoint);
      }
    }

    return;
  }
  if (
    nome !== "ChallengeResponseFailed" &&
    nome !== "InvalidAccountID" &&
    nome !== "InvalidPassword"
  ) {
    return;
  }

  const service =
    event.service ||
    event.Service;

  if (service && String(service).toUpperCase() !== "PJSIP") {
    return;
  }

  const remoteAddress =
    event.remoteaddress ||
    event.RemoteAddress;

  const ip = normalizeIp(remoteAddress);

  if (!ip) {
    console.warn(
      `[firewall] evento ${nome} sem RemoteAddress`
    );
    return;
  }

  try {
    await handleAuthFailure(ip, nome);
  } catch (err) {
    console.error(
      `[firewall] erro processando ${nome} de ${ip}:`,
      err.message || err
    );
  }
});

const reachableContacts = new Map();

const REACHABLE_WINDOW = 5000;

function registerReachableContact(endpoint, ip) {
  if (!endpoint || !ip) return;

  const now = Date.now();

  const existing = reachableContacts.get(endpoint) || {};

  reachableContacts.set(endpoint, {
    ...existing,
    ip,
    contactReachable: true,
    contactAt: now,
  });

  checkReachable(endpoint);
}

function registerReachablePeer(endpoint) {
  if (!endpoint) return;

  const now = Date.now();

  const existing = reachableContacts.get(endpoint) || {};

  reachableContacts.set(endpoint, {
    ...existing,
    peerReachable: true,
    peerAt: now,
  });

  checkReachable(endpoint);
}

function checkReachable(endpoint) {
  const data = reachableContacts.get(endpoint);

  if (!data) return;

  const now = Date.now();

  if (
    data.contactReachable &&
    data.peerReachable &&
    data.ip &&
    now - data.contactAt <= REACHABLE_WINDOW &&
    now - data.peerAt <= REACHABLE_WINDOW
  ) {
    resetAuthFailures(data.ip);

    reachableContacts.delete(endpoint);
  }
}

module.exports = {
  getEndpointsDeviceState,
  amiCommand,
  amiReady,
  queueAdd,
  queueRemove,
  queuePenalty,
  queueRefresh,
  onAmiConnect,
  getQueueStatus,
};
