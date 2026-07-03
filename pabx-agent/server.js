// pabx-agent — mini servidor HTTP que conversa com seu MariaDB Asterisk.
// Autentica via HMAC-SHA256 (compatível com src/lib/agent.server.ts do Lovable).

require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
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
  URA_SOUNDS_BASE = "/var/lib/asterisk/sounds/ura",
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
    limit: 240,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ---------- HMAC verification ----------
app.use((req, res, next) => {
  const ts = req.header("X-Timestamp");
  const sig = req.header("X-Signature");
  if (!ts || !sig) return res.status(401).json({ error: "Missing signature headers" });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > Number(SIGNATURE_WINDOW)) {
    return res.status(401).json({ error: "Timestamp out of window" });
  }

  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const p = req.originalUrl;
  const expected = crypto
    .createHmac("sha256", AGENT_SECRET)
    .update(`${ts}.${req.method.toUpperCase()}.${p}.${bodyHash}`)
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

function genPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[crypto.randomInt(0, chars.length)];
  return out;
}

// ---------- Health ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: "1.2.0", db: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e.message || e) });
  }
});

// ---------- Tenants ----------
app.post("/tenants", async (req, res) => {
  const { id, nome } = req.body || {};
  if (!id || !nome) return res.status(400).json({ error: "id e nome obrigatórios" });
  try {
    await pool.query(
      `INSERT INTO tenants (id, nome) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [Number(id), String(nome).slice(0, 50)],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/tenants", async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, nome FROM tenants ORDER BY id`);
    res.json({ tenants: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Ramais ----------
app.get("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, ramal, nome, tronco, ddd, callerid, senha,
              fixo, movel, ddi, especial, cng, endpoint_id,
              transbordo, transbordo_tronco
         FROM ramais
        WHERE tenant_id = ?
        ORDER BY ramal`,
      [tenant],
    );
    res.json({
      ramais: rows.map((r) => ({
        ...r,
        ddd: r.ddd == null ? null : String(r.ddd),
        fixo: !!r.fixo, movel: !!r.movel, ddi: !!r.ddi,
        especial: !!r.especial, cng: !!r.cng,
        transbordo: !!r.transbordo,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  let {
    nome, ramal, senha, tronco, ddd, callerid,
    fixo, movel, ddi, especial, cng,
    transbordo, transbordo_tronco,
  } = req.body || {};
  if (!ramal || !tronco || !ddd) {
    return res.status(400).json({ error: "Campos obrigatórios: ramal, tronco, ddd" });
  }
  ramal = String(ramal);
  if (!nome || String(nome).trim() === "") nome = ramal;
  if (!senha) senha = genPassword();
  const endpointId = `${tenant}${ramal}`;
  const authId = `auth-${endpointId}`;
  const transbordoInt = transbordo ? 1 : 0;
  const transbordoTroncoVal = transbordoInt && transbordo_tronco ? String(transbordo_tronco) : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT IGNORE INTO tenants (id, nome) VALUES (?, ?)`,
      [tenant, `tenant-${tenant}`],
    );

    // 1) ps_auths
    await conn.query(
      `INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`,
      [authId, endpointId, senha],
    );
    // 2) ps_aors
    await conn.query(
      `INSERT INTO ps_aors (id) VALUES (?)`,
      [endpointId],
    );
    // 3) ps_endpoints
    await conn.query(
      `INSERT INTO ps_endpoints (id, aors, auth, context, call_group, pickup_group)
       VALUES (?, ?, ?, 'internal-default', ?, ?)`,
      [endpointId, endpointId, authId, String(tenant), String(tenant)],
    );
    // 4) ramais (última)
    await conn.query(
      `INSERT INTO ramais (tenant_id, nome, ramal, endpoint_id, senha, tronco, ddd, callerid,
                           fixo, movel, ddi, especial, cng, transbordo, transbordo_tronco)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant, nome, ramal, endpointId, senha, tronco, String(ddd), callerid || null,
        fixo ? 1 : 0, movel ? 1 : 0, ddi ? 1 : 0, especial ? 1 : 0, cng ? 1 : 0,
        transbordoInt, transbordoTroncoVal,
      ],
    );

    await conn.commit();
    res.json({
      ramal: {
        ramal, nome, tronco, ddd: String(ddd), callerid, senha,
        fixo: !!fixo, movel: !!movel, ddi: !!ddi, especial: !!especial, cng: !!cng,
        transbordo: !!transbordoInt, transbordo_tronco: transbordoTroncoVal,
        endpoint_id: endpointId,
      },
    });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/ramais/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const {
    nome, tronco, ddd, callerid, senha,
    fixo, movel, ddi, especial, cng,
    transbordo, transbordo_tronco,
  } = req.body || {};
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
    const authId = `auth-${endpointId}`;

    const sets = [];
    const vals = [];
    const pushIf = (col, val) => { if (val !== undefined) { sets.push(`${col} = ?`); vals.push(val); } };
    pushIf("nome", nome);
    pushIf("tronco", tronco);
    if (ddd !== undefined) { sets.push("ddd = ?"); vals.push(String(ddd)); }
    pushIf("callerid", callerid);
    pushIf("senha", senha);
    if (fixo !== undefined)     { sets.push("fixo = ?");     vals.push(fixo ? 1 : 0); }
    if (movel !== undefined)    { sets.push("movel = ?");    vals.push(movel ? 1 : 0); }
    if (ddi !== undefined)      { sets.push("ddi = ?");      vals.push(ddi ? 1 : 0); }
    if (especial !== undefined) { sets.push("especial = ?"); vals.push(especial ? 1 : 0); }
    if (cng !== undefined)      { sets.push("cng = ?");      vals.push(cng ? 1 : 0); }
    if (transbordo !== undefined) {
      sets.push("transbordo = ?"); vals.push(transbordo ? 1 : 0);
      // se desligar transbordo, limpar tronco
      if (!transbordo) { sets.push("transbordo_tronco = ?"); vals.push(null); }
    }
    if (transbordo_tronco !== undefined && transbordo !== false) {
      sets.push("transbordo_tronco = ?");
      vals.push(transbordo_tronco || null);
    }

    if (sets.length > 0) {
      await conn.query(
        `UPDATE ramais SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        [...vals, id, tenant],
      );
    }
    if (senha !== undefined) {
      await conn.query(`UPDATE ps_auths SET password = ? WHERE id = ?`, [senha, authId]);
    }
    await conn.commit();
    res.json({ ok: true });
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
    const authId = `auth-${endpointId}`;
    await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ps_auths     WHERE id = ?`, [authId]);
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

// ---------- Troncos ----------
app.get("/troncos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, tronco_pjsip, status, techprefix, tipo
         FROM troncos
        WHERE tenant_id = ?
        ORDER BY nome`,
      [tenant],
    );
    res.json({ troncos: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Blacklist ----------
app.get("/blacklist", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, regra, tipo, destino, ativo, motivo, data_hora_desbloqueio
         FROM blacklist WHERE tenant_id = ? ORDER BY id DESC`,
      [tenant],
    );
    res.json({ blacklist: rows.map((r) => ({ ...r, ativo: !!r.ativo })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/blacklist", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { regra, tipo, destino, motivo, data_hora_desbloqueio } = req.body || {};
  if (!regra || !tipo || !destino || !data_hora_desbloqueio) {
    return res.status(400).json({ error: "regra, tipo, destino e data_hora_desbloqueio obrigatórios" });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO blacklist (tenant_id, regra, tipo, destino, ativo, motivo, data_hora_desbloqueio)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [tenant, regra, tipo, destino, motivo || null, data_hora_desbloqueio],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/blacklist/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    await pool.query(`DELETE FROM blacklist WHERE id = ? AND tenant_id = ?`, [Number(req.params.id), tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- CDR queries ----------
function cdrEndpoint(p, sql) {
  app.get(p, async (req, res) => {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    try {
      const [rows] = await pool.query(`${sql} LIMIT ?`, [tenant, limit]);
      res.json({ rows });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}

cdrEndpoint("/cdr/entrada",
  `SELECT id, linkedid, date_time, origem, num_destino, dest_interno, duracao, status
     FROM cdr_entrada WHERE tenant_id = ? ORDER BY date_time DESC`);
cdrEndpoint("/cdr/ramal",
  `SELECT id, linkedid, context, tipo_chamada, origem, destino, tronco, status, duracao, date_time
     FROM cdr_ramal WHERE tenant_id = ? ORDER BY date_time DESC`);
cdrEndpoint("/cdr/fila",
  `SELECT id, linkedid, nome_fila, agente, ramal, evento, motivo, time_data
     FROM cdr_fila WHERE tenant_id = ? ORDER BY time_data DESC`);
cdrEndpoint("/cdr/ura",
  `SELECT id, linkedid, num_did, nome_ura, opcao, dest_op, dest_nome
     FROM cdr_ura WHERE tenant_id = ? ORDER BY id DESC`);
cdrEndpoint("/cdr/cidades/entrada",
  `SELECT id, ddd, numero, sigla_estado, estado
     FROM cdr_cidades_entrada WHERE tenant_id = ? ORDER BY id DESC`);
cdrEndpoint("/cdr/cidades/saida",
  `SELECT id, ddd, numero, sigla_estado, estado
     FROM cdr_cidades_saida WHERE tenant_id = ? ORDER BY id DESC`);

// ---------- Filas (gestão) ----------
app.get("/filas", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT f.id, f.virtual_extension, f.name, f.display_name, f.description, f.active,
              q.strategy, q.timeout, q.maxlen, q.musiconhold,
              (SELECT COUNT(*) FROM filas_ramais fr
                 WHERE fr.tenant_id = f.tenant_id AND fr.fila_ramal = f.virtual_extension) AS membros
         FROM filas f
         LEFT JOIN queues q ON q.tenant_id = f.tenant_id AND q.name = f.name
        WHERE f.tenant_id = ?
        ORDER BY f.virtual_extension`,
      [String(tenant)],
    );
    res.json({ filas: rows.map((r) => ({ ...r, active: !!r.active })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/filas/:virtualExt/membros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const virtualExt = String(req.params.virtualExt);
  try {
    const [filaRows] = await pool.query(
      `SELECT id, virtual_extension, name, display_name, description, active
         FROM filas WHERE tenant_id = ? AND virtual_extension = ? LIMIT 1`,
      [String(tenant), virtualExt],
    );
    if (filaRows.length === 0) return res.status(404).json({ error: "Fila não encontrada" });
    const fila = filaRows[0];

    const [agentes] = await pool.query(
      `SELECT fr.id, fr.nome_ramal, fr.fila_ramal,
              r.ramal, r.nome AS ramal_display, r.callerid
         FROM filas_ramais fr
         LEFT JOIN ramais r ON r.tenant_id = ? AND r.nome = fr.nome_ramal
        WHERE fr.tenant_id = ? AND fr.fila_ramal = ?
        ORDER BY fr.id`,
      [Number(tenant), String(tenant), virtualExt],
    );

    const [queueRows] = await pool.query(
      `SELECT * FROM queues WHERE tenant_id = ? AND name = ? LIMIT 1`,
      [String(tenant), fila.name],
    );

    const [members] = await pool.query(
      `SELECT interface, membername, penalty, paused, reason_paused
         FROM queue_members WHERE tenant_id = ? AND queue_name = ?
        ORDER BY interface`,
      [String(tenant), fila.name],
    );

    res.json({
      fila: { ...fila, active: !!fila.active },
      agentes,
      queue: queueRows[0] ?? null,
      queue_members: members,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- URAs (gestão) ----------
app.get("/uras", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, audio, max_digits, tentativas, timeout, ativo
         FROM uras WHERE tenant_id = ? ORDER BY id`,
      [tenant],
    );
    const uras = rows.map((r) => ({ ...r, ativo: !!r.ativo }));
    for (const u of uras) {
      const [opts] = await pool.query(
        `SELECT id, digito, tipo_destino, destino FROM ura_opcoes WHERE ura_id = ? ORDER BY digito`,
        [u.id],
      );
      u.opcoes = opts;
    }
    res.json({ uras });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// lista arquivos .wav em /var/lib/asterisk/sounds/ura/t{tenant}/
app.get("/uras/audios", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const dir = path.join(URA_SOUNDS_BASE, `t${tenant}`);
  try {
    const files = await fs.readdir(dir);
    const audios = files
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .map((f) => f.replace(/\.wav$/i, ""));
    res.json({ audios, dir });
  } catch (e) {
    if (e.code === "ENOENT") return res.json({ audios: [], dir, warn: "diretório inexistente" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

// lista destinos possíveis (filas, uras, ramais) para escolha de opção
app.get("/uras/destinos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [filas] = await pool.query(
      `SELECT virtual_extension AS value, display_name AS label FROM filas WHERE tenant_id = ? ORDER BY display_name`,
      [String(tenant)],
    );
    const [uras] = await pool.query(
      `SELECT id AS value, nome AS label FROM uras WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    const [ramais] = await pool.query(
      `SELECT ramal AS value, nome AS label FROM ramais WHERE tenant_id = ? ORDER BY ramal`,
      [tenant],
    );
    const [troncos] = await pool.query(
      `SELECT nome AS value, nome AS label FROM troncos WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    res.json({ filas, uras, ramais, troncos });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/uras", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, audio, max_digits, tentativas, timeout, ativo } = req.body || {};
  if (!nome || !audio || max_digits == null || tentativas == null || timeout == null) {
    return res.status(400).json({ error: "nome, audio, max_digits, tentativas, timeout obrigatórios" });
  }
  try {
    const [dup] = await pool.query(
      `SELECT id FROM uras WHERE tenant_id = ? AND nome = ? LIMIT 1`,
      [tenant, nome],
    );
    if (dup.length) return res.status(409).json({ error: "Já existe uma URA com esse nome neste tenant" });

    const [r] = await pool.query(
      `INSERT INTO uras (tenant_id, nome, audio, max_digits, tentativas, timeout, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenant, nome, audio, Number(max_digits), Number(tentativas), Number(timeout), ativo ? 1 : 0],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/uras/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const { nome, audio, max_digits, tentativas, timeout, ativo } = req.body || {};
  const sets = [];
  const vals = [];
  const pushIf = (c, v, transform = (x) => x) => {
    if (v !== undefined) { sets.push(`${c} = ?`); vals.push(transform(v)); }
  };
  pushIf("nome", nome);
  pushIf("audio", audio);
  pushIf("max_digits", max_digits, Number);
  pushIf("tentativas", tentativas, Number);
  pushIf("timeout", timeout, Number);
  if (ativo !== undefined) { sets.push("ativo = ?"); vals.push(ativo ? 1 : 0); }
  if (!sets.length) return res.json({ ok: true });
  try {
    if (nome !== undefined) {
      const [dup] = await pool.query(
        `SELECT id FROM uras WHERE tenant_id = ? AND nome = ? AND id <> ? LIMIT 1`,
        [tenant, nome, id],
      );
      if (dup.length) return res.status(409).json({ error: "Já existe uma URA com esse nome neste tenant" });
    }
    await pool.query(
      `UPDATE uras SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      [...vals, id, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/uras/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM ura_opcoes WHERE ura_id = ?`, [id]);
    await pool.query(`DELETE FROM uras WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/uras/:id/opcoes", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const uraId = Number(req.params.id);
  const { digito, tipo_destino, destino } = req.body || {};
  if (!tipo_destino || !destino) return res.status(400).json({ error: "tipo_destino e destino obrigatórios" });
  try {
    const [own] = await pool.query(`SELECT id FROM uras WHERE id = ? AND tenant_id = ?`, [uraId, tenant]);
    if (!own.length) return res.status(404).json({ error: "URA não encontrada" });
    const [r] = await pool.query(
      `INSERT INTO ura_opcoes (ura_id, digito, tipo_destino, destino) VALUES (?, ?, ?, ?)`,
      [uraId, String(digito ?? ""), String(tipo_destino), String(destino)],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/uras/opcoes/:opcaoId", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const opcaoId = Number(req.params.opcaoId);
  try {
    // garantir tenant
    await pool.query(
      `DELETE o FROM ura_opcoes o
        JOIN uras u ON u.id = o.ura_id
       WHERE o.id = ? AND u.tenant_id = ?`,
      [opcaoId, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// cdr_pesquisa não tem tenant_id direto — filtramos via JOIN em pesquisa_satisfacao
app.get("/cdr/pesquisa", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.unique_id, p.numero_origem, p.ramal, p.agente, p.fila, p.nome_fila,
              p.pergunta_id, p.nota, p.data
         FROM cdr_pesquisa p
         LEFT JOIN pesquisa_satisfacao ps ON ps.id = p.pesquisa_id
        WHERE ps.tenant_id = ? OR ps.tenant_id IS NULL
        ORDER BY p.data DESC
        LIMIT ?`,
      [tenant, limit],
    );
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

app.listen(Number(PORT), () => {
  console.log(`[pabx-agent] ouvindo em http://127.0.0.1:${PORT}`);
});
