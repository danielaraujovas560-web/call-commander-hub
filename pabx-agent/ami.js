// ami.js — cliente AMI (Asterisk Manager Interface) para status de endpoints.
// Substitui "asterisk -rx pjsip show endpoints" por uma conexão AMI persistente.

const AsteriskManager = require("asterisk-manager");

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

ami.on("connect", () => console.log("[ami] conectado"));
ami.on("error", (err) => console.error("[ami] erro:", err.message || err));

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

module.exports = { getEndpointsDeviceState };
