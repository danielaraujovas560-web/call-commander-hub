const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const IPTABLES = "/usr/sbin/iptables";

// Use a mesma conexão/pool do seu Agent.
// Ajuste este require para o arquivo onde seu pool está exportado.
const pool = require("./db");

const CHAIN = "PABX-BLOCK";
const MAX_FAILURES = 10;

const failures = new Map();

function normalizeIp(remoteAddress) {
  if (!remoteAddress) return null;

  const match = String(remoteAddress).match(
    /(?:IPV4|IPV6)\/[^/]+\/(.+?)\/\d+$/
  );

  if (match) return match[1];

  return String(remoteAddress)
    .replace(/^\[/, "")
    .replace(/\]:\d+$/, "")
    .replace(/:\d+$/, "");
}

async function isWhitelisted(ip) {
  const [rows] = await pool.query(
    `SELECT id
       FROM firewall_ips
      WHERE ip = ?
        AND tipo = 'WHITELIST'
      LIMIT 1`,
    [ip]
  );

  return rows.length > 0;
}

async function isBlacklisted(ip) {
  const [rows] = await pool.query(
    `SELECT id
       FROM firewall_ips
      WHERE ip = ?
        AND tipo = 'BLACKLIST'
      LIMIT 1`,
    [ip]
  );

  return rows.length > 0;
}

async function ensureChain() {
  try {
    await execFileAsync("sudo", [IPTABLES, "-N", CHAIN]);
    console.log(`[firewall] chain ${CHAIN} criada`);
  } catch (e) {
    // Chain já existe. Não é erro para nós.
  }

  try {
    await execFileAsync("sudo", [IPTABLES, "-C", "INPUT", "-j", CHAIN]);
  } catch (e) {
    await execFileAsync("sudo", [IPTABLES, "-I", "INPUT", "1", "-j", CHAIN]);
    console.log(`[firewall] chain ${CHAIN} adicionada ao INPUT`);
  }
}

async function addDropRule(ip) {
  try {
    await execFileAsync("sudo", [
      IPTABLES,
      "-C",
      CHAIN,
      "-s",
      ip,
      "-j",
      "DROP",
    ]);

    console.log(`[firewall] ${ip} já está bloqueado no iptables`);
    return;
  } catch (e) {
    // Regra ainda não existe.
  }

  await execFileAsync("sudo", [
    IPTABLES,
    "-A",
    CHAIN,
    "-s",
    ip,
    "-j",
    "DROP",
  ]);

  console.log(`[firewall] DROP aplicado: ${ip}`);
}

async function blockIp(ip, motivo = "Falhas de autenticação") {
  if (!ip) return;

  if (await isWhitelisted(ip)) {
    console.log(`[firewall] ${ip} está na WHITELIST, ignorando bloqueio`);
    failures.delete(ip);
    return;
  }

  if (await isBlacklisted(ip)) {
    console.log(`[firewall] ${ip} já está na BLACKLIST`);
    failures.delete(ip);
    return;
  }

  await pool.query(
    `INSERT INTO firewall_ips
      (ip, tipo, motivo, origem)
     VALUES (?, 'BLACKLIST', ?, 'AUTO')`,
    [ip, motivo]
  );

  await addDropRule(ip);

  failures.delete(ip);

  console.log(`[firewall] IP bloqueado permanentemente: ${ip}`);
}

async function handleAuthFailure(ip, eventName) {
  if (!ip) return;

  if (await isWhitelisted(ip)) {
    return;
  }

  if (await isBlacklisted(ip)) {
    return;
  }

  const count = (failures.get(ip) || 0) + 1;

  failures.set(ip, count);

  console.log(
    `[firewall] ${eventName}: ${ip} (${count}/${MAX_FAILURES})`
  );

  if (count >= MAX_FAILURES) {
    await blockIp(
      ip,
      `10 falhas consecutivas de autenticação (${eventName})`
    );
  }
}

async function restoreBlacklist() {
  const [rows] = await pool.query(
    `SELECT ip
       FROM firewall_ips
      WHERE tipo = 'BLACKLIST'`
  );

  console.log(
    `[firewall] restaurando ${rows.length} IP(s) da BLACKLIST...`
  );

  for (const row of rows) {
    try {
      await addDropRule(row.ip);
    } catch (e) {
      console.error(
        `[firewall] erro ao restaurar ${row.ip}:`,
        e.message
      );
    }
  }
}

function resetAuthFailures(ip) {
  if (!ip) return;

  if (failures.has(ip)) {
    failures.delete(ip);
    console.log(`[firewall] contador resetado: ${ip}`);
  }
}

module.exports = {
  CHAIN,
  ensureChain,
  restoreBlacklist,
  handleAuthFailure,
  resetAuthFailures,
  blockIp,
  normalizeIp,
};
