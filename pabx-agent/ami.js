// ami.js — cliente AMI (Asterisk Manager Interface).
// Substitui `asterisk -rx` por uma conexão AMI persistente.
// Exporta:
//   - getEndpointsDeviceState(): map { objectName: deviceState } via PJSIPShowEndpoints
//   - amiCommand(cli): executa um comando de CLI via AMI (Action: Command)
//   - amiReady(): true se a conexão AMI está viva

const AsteriskManager = require("asterisk-manager");

const {
  AMI_HOST = "127.0.0.1",
  AMI_PORT = "5038",
  AMI_USER,
  AMI_PASSWORD,
} = process.env;

if (!AMI_USER || !AMI_PASSWORD) {
  console.error("AMI_USER/AMI_PASSWORD ausentes no .env — AMI não vai funcionar.");
}

const ami = new AsteriskManager(Number(AMI_PORT), AMI_HOST, AMI_USER, AMI_PASSWORD, true);
ami.keepConnected();

let _connected = false;
ami.on("connect", () => {
  _connected = true;
  console.log("[ami] conectado");
});
ami.on("disconnect", () => {
  _connected = false;
  console.warn("[ami] desconectado");
});
ami.on("error", (err) => {
  _connected = false;
  console.error("[ami] erro:", err && err.message ? err.message : err);
});

function amiReady() {
  return _connected;
}

let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  return `pabx-${Date.now()}-${actionCounter}`;
}

/**
 * Executa PJSIPShowEndpoints via AMI e retorna { objectName: deviceState }.
 * deviceState: NOT_INUSE, INUSE, BUSY, UNAVAILABLE, RINGING, ONHOLD, UNKNOWN, INVALID.
 * Lança erro em timeout ou falha de conexão — quem chama decide o que fazer com o cache.
 */
function getEndpointsDeviceState(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!_connected) return reject(new Error("AMI não conectado"));
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
      reject(new Error("Timeout aguardando PJSIPShowEndpoints"));
    }, timeoutMs);

    ami.on("managerevent", onEvent);
    ami.action({ action: "PJSIPShowEndpoints", actionid: actionId }, (err) => {
      if (err) {
        cleanup();
        reject(err);
      }
    });
  });
}

/**
 * Executa um comando de CLI do Asterisk via AMI (Action: Command).
 * Ex.: amiCommand("pjsip reload"), amiCommand("queue reload all").
 * Não usa `asterisk -rx`.
 */
function amiCommand(cli, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!_connected) return reject(new Error("AMI não conectado"));
    const actionId = nextActionId();
    const timer = setTimeout(() => reject(new Error(`Timeout AMI Command: ${cli}`)), timeoutMs);
    ami.action(
      { action: "Command", command: cli, actionid: actionId },
      (err, res) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(res && (res.output || res.Output) ? String(res.output || res.Output) : "");
      },
    );
  });
}

module.exports = { getEndpointsDeviceState, amiCommand, amiReady };
