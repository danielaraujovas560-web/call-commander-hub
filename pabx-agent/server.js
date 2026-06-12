// pabx-agent — mini servidor HTTP que conversa com seu MariaDB Asterisk.
// Autentica via HMAC-SHA256 (compatível com src/lib/agent.server.ts do Lovable).
//
// Endpoints (todos exigem header X-Tenant-Id):
//   GET    /health
//   GET    /ramais?tenant=<id>
//   POST   /ramais            body: { nome, ramal, senha, tronco, ddd, callerid, fixo, movel, ddi, especial, cng }
//   DELETE /ramais/:id
//   GET    /troncos?tenant=<id>

require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const {
  DB_HOST = "127.0.0.1",
  DB_PORT = "3306",
  DB_USER = "asterisk",
  DB_PASSWORD = "",
  DB_NAME = "asterisk",
  AGENT_SECRET,
  SIGNATURE_WINDOW = "300",
  PORT = "8787",
} = process.env;

if (!AGENT_SECRET || AGENT_SECRET.length < 16) {
  console.error("AGENT_SECRET ausente ou curto demais (>=16 chars). Edite .env e reinicie.");
  process.exit(1);
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ---------- HMAC verification ----------
app.use((req, res, next) => {
  if (req.path === "/health" && req.method === "GET") {
    // health também valida HMAC (assim o painel sabe que a chave bate)
  }
  const ts = req.header("X-Timestamp");
  const sig = req.header("X-Signature");
  if (!ts || !sig) return res.status(401).json({ error: "Missing signature headers" });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > Number(SIGNATURE_WINDOW)) {
    return res.status(401).json({ error: "Timestamp out of window" });
  }

  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const path = req.originalUrl;
  const expected = crypto
    .createHmac("sha256", AGENT_SECRET)
    .update(`${ts}.${req.method.toUpperCase()}.${path}.${bodyHash}`)
    .digest("hex");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  next();
});

function getTenant(req, res) {
  const t = Number(req.header("X-Tenant-Id"));
  if (!t || Number.isNaN(t)) {
    res.status(400).json({ error: "X-Tenant-Id header required" });
    return null;
  }
  return t;
}

// ---------- Routes ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: "1.0.0", db: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e.message || e) });
  }
});

app.get("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, ramal, nome, tronco, ddd, callerid, senha,
              fixo, movel, ddi, especial, cng, endpoint_id
         FROM ramais
        WHERE tenant_id = ?
        ORDER BY ramal`,
      [tenant],
    );
    res.json({
      ramais: rows.map((r) => ({
        ...r,
        fixo: !!r.fixo, movel: !!r.movel, ddi: !!r.ddi,
        especial: !!r.especial, cng: !!r.cng,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/troncos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    // Ajuste se sua tabela de troncos tiver nome diferente
    const [rows] = await pool.query(
      `SELECT e.id AS endpoint_id, a.username, ao.contact AS host,
              e.context, e.id AS label
         FROM ps_endpoints e
         LEFT JOIN ps_auths a ON a.id = e.auth
         LEFT JOIN ps_aors  ao ON ao.id = e.aors
        WHERE e.tenant = ?
        ORDER BY e.id`,
      [String(tenant)],
    );
    res.json({ troncos: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, ramal, senha, tronco, ddd, callerid, fixo, movel, ddi, especial, cng } = req.body || {};
  if (!ramal || !senha || !tronco) {
    return res.status(400).json({ error: "Campos obrigatórios: ramal, senha, tronco" });
  }
  const endpointId = `${tenant}${ramal}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO ramais (tenant_id, ramal, nome, tronco, ddd, callerid, senha,
                           fixo, movel, ddi, especial, cng, endpoint_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant, ramal, nome ?? null, tronco, ddd ?? null, callerid || null, senha,
       !!fixo, !!movel, !!ddi, !!especial, !!cng, endpointId],
    );

    await conn.query(
      `INSERT INTO ps_aors (id, max_contacts, qualify_frequency)
       VALUES (?, 1, 60)`,
      [endpointId],
    );
    await conn.query(
      `INSERT INTO ps_auths (id, auth_type, username, password)
       VALUES (?, 'userpass', ?, ?)`,
      [endpointId, endpointId, senha],
    );
    await conn.query(
      `INSERT INTO ps_endpoints (id, transport, aors, auth, context,
                                 disallow, allow, tenant, callerid)
       VALUES (?, 'transport-udp', ?, ?, 'from-internal',
               'all', 'alaw,ulaw,g729', ?, ?)`,
      [endpointId, endpointId, endpointId, String(tenant), callerid || null],
    );

    await conn.commit();
    res.json({ ramal: { id: null, ramal, nome, tronco, ddd, callerid, senha,
      fixo: !!fixo, movel: !!movel, ddi: !!ddi, especial: !!especial, cng: !!cng,
      endpoint_id: endpointId } });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.delete("/ramais/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT endpoint_id FROM ramais WHERE id = ? AND tenant_id = ?`,
      [id, tenant],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Ramal não encontrado" });
    }
    const endpointId = rows[0].endpoint_id;
    await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ps_auths     WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ps_aors      WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ramais       WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

app.listen(Number(PORT), () => {
  console.log(`[pabx-agent] ouvindo em http://127.0.0.1:${PORT}`);
});
