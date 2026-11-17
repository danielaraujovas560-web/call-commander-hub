"use strict";

const net = require("node:net");
const fs = require("node:fs");
const logger = require("./logger");

const SOCKET =
  process.env.PABXCTL_SOCKET ||
  "/run/pabx-agent-dev/control.sock";

function startLogControl() {
  const server = net.createServer((client) => {
    let buffer = "";
    let handled = false;

    client.setTimeout(3000, () => client.destroy());

    client.on("data", (chunk) => {
      if (handled) return;

      buffer += chunk.toString("utf8");

      if (buffer.length > 2048) {
        handled = true;
        client.end(JSON.stringify({
          ok: false,
          error: "Comando muito grande",
        }) + "\n");
        return;
      }

      const end = buffer.indexOf("\n");
      if (end === -1) return;

      handled = true;

      try {
        const cmd = JSON.parse(buffer.slice(0, end));
        let result;

        if (cmd.action === "log.status") {
          result = logger.status();
        } else if (cmd.action === "log.set") {
          result = logger.setLevel(
            cmd.level,
            cmd.seconds ?? 0
          );
        } else {
          throw new Error("Comando desconhecido");
        }

        client.end(JSON.stringify({
          ok: true,
          ...result,
        }) + "\n");

      } catch (error) {
        client.end(JSON.stringify({
          ok: false,
          error: error.message,
        }) + "\n");
      }
    });

    client.on("error", () => {});
  });

  server.on("error", (error) => {
    logger.error("[PABXCTL] Falha:", error.message);
  });

  server.listen(SOCKET, () => {
    fs.chmodSync(SOCKET, 0o600);
    logger.info("[PABXCTL] Controle local disponível");
  });

  return server;
}

module.exports = { startLogControl };
