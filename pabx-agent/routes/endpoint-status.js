const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getEndpointsDeviceState } = require("../ami");

let _endpointsCache = {
  at: 0,
  lastOk: 0,
  map: {},
};

const ENDPOINTS_CACHE_MS = 3000;
const ENDPOINTS_STALE_MS = 15000;

// Estados que indicam um endpoint disponível ou em uso.
const ONLINE_STATES = new Set([
  "REACHABLE",
  "NOT_IN_USE",
  "NOT_INUSE",
  "IN_USE",
  "INUSE",
  "BUSY",
  "RINGING",
  "RING_IN_USE",
  "RINGINUSE",
  "ON_HOLD",
  "ONHOLD",
]);

const OFFLINE_STATES = new Set([
  "UNAVAILABLE",
  "UNREACHABLE",
]);

function normalizeState(state) {
  return String(state ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isOnline(state) {
  return ONLINE_STATES.has(normalizeState(state));
}

function getCombinedState(states) {
  const normalized = states
    .filter((state) => state !== null && state !== undefined && state !== "")
    .map(normalizeState);

  // Se qualquer dispositivo estiver online, o ramal está online.
  const active = normalized.find((state) => isOnline(state));

  if (active) {
    return active;
  }

  // Se nenhum estiver online, verifica os estados offline.
  if (normalized.some((state) => OFFLINE_STATES.has(state))) {
    return "UNAVAILABLE";
  }

  // Estado desconhecido ou nenhum endpoint encontrado.
  return "UNKNOWN";
}

async function fetchEndpointsMap() {
  const now = Date.now();

  if (now - _endpointsCache.at < ENDPOINTS_CACHE_MS) {
    return _endpointsCache.map;
  }

  try {
    const map = await getEndpointsDeviceState();

    _endpointsCache = {
      at: now,
      lastOk: now,
      map,
    };

    return map;
  } catch (e) {
    console.error(
      "[AMI] fetchEndpointsMap falhou:",
      e.message || e
    );

    // Reutiliza os dados apenas enquanto ainda estiverem recentes.
    const cacheValido =
      _endpointsCache.lastOk > 0 &&
      now - _endpointsCache.lastOk <= ENDPOINTS_STALE_MS;

    _endpointsCache.at = now;

    if (!cacheValido) {
      _endpointsCache.map = {};
    }

    return _endpointsCache.map;
  }
}

// ======================================================
// STATUS DOS RAMAIS
// ======================================================

router.get("/ramais/status", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT ramal, endpoint_id
       FROM ramais
       WHERE tenant_id = ?`,
      [tenant]
    );

    const map = await fetchEndpointsMap();
    const endpoints = {};

    for (const row of rows) {
      const ramal = String(row.ramal);

      const endpointId =
        row.endpoint_id || `t${tenant}-${ramal}`;

      // Compatibilidade com nomes diferentes de endpoints.
      const candidatos = [
        endpointId,
        `${endpointId}-web`,
        ramal,
        `${ramal}-web`,
      ];

      const nomes = [...new Set(candidatos)];

      const estados = nomes.map((nome) => map[nome]);

      const status = getCombinedState(estados);

      endpoints[ramal] = status;

      if (process.env.DEBUG_ENDPOINT_STATUS === "1") {
        console.log("[ENDPOINT STATUS]", {
          ramal,
          endpointId,
          dispositivos: Object.fromEntries(
            nomes.map((nome) => [
              nome,
              map[nome] ?? "UNKNOWN",
            ])
          ),
          resultado: status,
        });
      }
    }

    return res.json({ endpoints });

  } catch (e) {
    console.error("[RAMAL STATUS]", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

// ======================================================
// STATUS DOS TRONCOS
// ======================================================

router.get("/troncos/status", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT tronco_pjsip
       FROM troncos
       WHERE tenant_id = ?`,
      [tenant]
    );

    const map = await fetchEndpointsMap();

console.log("[DEBUG AMI] Todos os endpoints:", JSON.stringify(map, null, 2));

console.log("[DEBUG AMI] Ramais WebRTC:", {
  "12000": map["12000"],
  "12000-web": map["12000-web"],
  "19999": map["19999"],
  "19999-web": map["19999-web"],
});

console.log("[DEBUG DB] Ramais:", rows);

    const endpoints = {};

    for (const row of rows) {
      const endpointName = String(row.tronco_pjsip);

      endpoints[endpointName] =
        map[endpointName] || "UNKNOWN";
    }

    return res.json({ endpoints });

  } catch (e) {
    console.error("[TRONCO STATUS]", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

// ======================================================
// STATUS INDIVIDUAL DO TRONCO
// ======================================================

router.get("/troncos/:pjsip/status", async (req, res) => {
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  const pjsip = req.params.pjsip;

  try {
    const [rows] = await pool.query(
      `SELECT tronco_pjsip
       FROM troncos
       WHERE tenant_id = ?
       AND tronco_pjsip = ?
       LIMIT 1`,
      [tenant, pjsip]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Tronco não encontrado",
      });
    }

    const endpointName = rows[0].tronco_pjsip;

    const map = await fetchEndpointsMap();

    const state = normalizeState(
      map[endpointName] || "UNKNOWN"
    );

    const status = isOnline(state)
      ? "online"
      : OFFLINE_STATES.has(state)
        ? "offline"
        : "unknown";

    return res.json({
      endpoint: endpointName,
      state,
      status,
    });

  } catch (e) {
    console.error("[TRONCO STATUS INDIVIDUAL]", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
