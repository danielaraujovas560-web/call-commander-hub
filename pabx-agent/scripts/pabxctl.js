#!/usr/bin/env node
"use strict";

const net = require("node:net");

const SOCKET = process.env.PABXCTL_SOCKET

const [group, command, value] = process.argv.slice(2);

let payload;

if (group === "log" && command === "status") {
  payload = { action: "log.status" };
} else if (
  group === "log" &&
  ["error", "warn", "info", "debug"].includes(command)
) {
  payload = {
    action: "log.set",
    level: command,
    seconds: value === undefined ? 0 : Number(value),
  };
} else {
  console.error(
    "Uso: pabxctl log status | " +
    "pabxctl log <error|warn|info|debug> [segundos]"
  );
  process.exit(1);
}

const client = net.createConnection({ path: SOCKET });
let response = "";

client.setTimeout(3000, () => {
  console.error("Timeout no controle do PABX");
  client.destroy();
  process.exitCode = 1;
});

client.on("connect", () => {
  client.write(JSON.stringify(payload) + "\n");
});

client.on("data", (chunk) => {
  response += chunk.toString();
});

client.on("end", () => {
  try {
    const result = JSON.parse(response.trim());

    if (!result.ok) {
      console.error("Erro:", result.error);
      process.exitCode = 1;
      return;
    }

    console.log("Nível atual:", result.level);
    console.log("Nível padrão:", result.defaultLevel);

    if (result.expiresAt) {
      console.log("Expira em:", result.expiresAt);
    }
  } catch {
    console.error("Resposta inválida do agente");
    process.exitCode = 1;
  }
});

client.on("error", (error) => {
  console.error("Falha ao conectar:", error.message);
  process.exitCode = 1;
});
