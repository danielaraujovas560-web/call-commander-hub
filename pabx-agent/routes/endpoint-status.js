const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { getTenant } = require("../utils/tenant");
const { getEndpointsDeviceState } = require("../ami");

let _endpointsCache = { at: 0, lastOk: 0, map: {} };
const ENDPOINTS_CACHE_MS = 3000; // reusa se muito recente
const ENDPOINTS_STALE_MS = 15000; // além disso, se AMI falhar, marca tudo como UNKNOWN
async function fetchEndpointsMap() {
  const now = Date.now();
  if (now - _endpointsCache.at < ENDPOINTS_CACHE_MS) return _endpointsCache.map;
  try {
    const map = await getEndpointsDeviceState();
    _endpointsCache = { at: now, lastOk: now, map };
    return map;
  } catch (e) {
    console.error("[ami] fetchEndpointsMap falhou:", e.message || e);
    _endpointsCache.at = now;
    // Se faz muito tempo desde a última leitura boa, não devolve estado
    // "velho" — melhor sinalizar unknown/offline pro painel.
    if (now - _endpointsCache.lastOk > ENDPOINTS_STALE_MS) {
      return {};
    }
    return _endpointsCache.map;
  }
}

router.get("/ramais/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(`SELECT ramal, endpoint_id FROM ramais WHERE tenant_id = ?`, [
      tenant,
    ]);
    const map = await fetchEndpointsMap();
    const endpoints = {};
    for (const row of rows) {
      const key = row.endpoint_id || `t${tenant}-${row.ramal}`;
      endpoints[String(row.ramal)] = map[key] || "Unknown";
    }
    res.json({ endpoints });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/troncos/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(`SELECT tronco_pjsip FROM troncos WHERE tenant_id = ?`, [
      tenant,
    ]);
    const map = await fetchEndpointsMap();
    const endpoints = {};
    for (const row of rows) {
      endpoints[String(row.tronco_pjsip)] = map[row.tronco_pjsip] || "Unknown";
    }
    res.json({ endpoints });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/troncos/:pjsip/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const pjsip = req.params.pjsip;
  try {
    const [rows] = await pool.query(
      `SELECT tronco_pjsip FROM troncos WHERE tenant_id = ? AND tronco_pjsip = ? LIMIT 1`,
      [tenant, pjsip],
    );
    if (!rows.length) return res.status(404).json({ error: "Tronco não encontrado" });
    const endpointName = rows[0].tronco_pjsip;
    // usa o cache do AMI (PJSIPShowEndpoints) — mesma fonte do /troncos/status
    const map = await fetchEndpointsMap();
    const state = map[endpointName] || "";
    const status =
      !state || state === "UNKNOWN" ? "unknown" : state === "UNAVAILABLE" ? "offline" : "online";
    res.json({ endpoint: endpointName, state, status });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
