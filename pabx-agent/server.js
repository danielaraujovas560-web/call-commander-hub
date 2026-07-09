// pabx-agent — mini servidor HTTP que conversa com seu MariaDB Asterisk.
// Autentica via HMAC-SHA256 (compatível com src/lib/agent.server.ts do Lovable).

require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const rateLimit = require("express-rate-limit");
const { getEndpointsDeviceState, amiCommand, amiReady } = require("./ami");

// Helpers para disparar reloads sem CLI. Falha silenciosa — o painel não deve
// travar se o AMI cair; mas logamos para investigação.
function amiPjsipReload() {
  return amiCommand("pjsip reload").catch((e) => {
    console.error("[ami] pjsip reload falhou:", e.message || e);
  });
}
function amiQueueReloadAll() {
  return amiCommand("queue reload all").catch((e) => {
    console.error("[ami] queue reload all falhou:", e.message || e);
  });
}

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
  ASTERISK_BIN = "asterisk",
} = process.env;

if (!AGENT_SECRET || AGENT_SECRET.length < 16) {
  console.error("AGENT_SECRET ausente ou curto demais (>=16 chars). Edite .env e reinicie.");
  process.exit(1);
}

const { JWT_SECRET } = process.env;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET ausente ou curto demais. Edite .env e reinicie.");
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
 if (req.path.startsWith("/auth/") || req.path.startsWith("/tenant/") || req.path.startsWith("/admin/") || req.path.startsWith("/clientes") || req.path.startsWith("/my/") || req.path.startsWith("/audit-log/")) return next();
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

// ---------- Autenticação (login do painel) ----------
function requireJwt(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "sem token" });
  try {
    const p = jwt.verify(m[1], JWT_SECRET);
    req.userId = p.sub;
    req.role = p.role;
    next();
  } catch {
    res.status(401).json({ error: "token inválido" });
  }
}

app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: "email e senha obrigatórios" });
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, email, senha_hash FROM profiles WHERE email = ? LIMIT 1",
      [email],
    );
    if (!rows.length) return res.status(401).json({ error: "credenciais inválidas" });
    const u = rows[0];
    const ok = await bcrypt.compare(senha, u.senha_hash);
    if (!ok) return res.status(401).json({ error: "credenciais inválidas" });

    const [[roleRow]] = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role LIMIT 1",
      [u.id],
    );
    const role = roleRow?.role || "cliente";
    const token = jwt.sign({ sub: u.id, role }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, role } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/auth/me", requireJwt, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nome, email FROM profiles WHERE id = ?", [req.userId]);
    if (!rows.length) return res.status(404).json({ error: "usuário não encontrado" });
    res.json({ user: rows[0], role: req.role });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Identidade: role + resolução de tenant ----------
async function getUserRole(userId) {
  const [[row]] = await pool.query(
    "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role LIMIT 1",
    [userId],
  );
  return row?.role || "cliente";
}

// Resolve qual tenant_id o usuário deve usar.
// - Se `override` for passado: admin pode usar qualquer tenant; cliente só
//   se estiver em tenants_link (ou se o tenant existir em `clientes`, mantendo
//   a mesma regra de fallback que já existia no lado Supabase).
// - Se `override` for omitido: pega o tenant padrão do usuário (is_default),
//   e se for admin sem vínculo, cai no primeiro tenant cadastrado.
async function resolveTenantId(userId, role, override) {
  if (override != null) {
    if (role === "admin") return Number(override);
    const [[linked]] = await pool.query(
      "SELECT 1 AS ok FROM tenants_link WHERE user_id = ? AND tenant_id = ? LIMIT 1",
      [userId, Number(override)],
    );
    if (linked) return Number(override);
    const [[cliente]] = await pool.query(
      "SELECT 1 AS ok FROM clientes WHERE tenant_id = ? LIMIT 1",
      [Number(override)],
    );
    if (cliente) return Number(override);
    throw new Error("Sem permissão para este tenant.");
  }

  const [[link]] = await pool.query(
    `SELECT tenant_id FROM tenants_link WHERE user_id = ?
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [userId],
  );
  if (link) return Number(link.tenant_id);

  if (role === "admin") {
    const [[anyLink]] = await pool.query(
      "SELECT tenant_id FROM tenants_link ORDER BY created_at ASC LIMIT 1",
    );
    if (anyLink) return Number(anyLink.tenant_id);
    throw new Error("Nenhum tenant cadastrado no sistema. Crie um usuário cliente vinculado a um tenant_id primeiro.");
  }

  throw new Error("Nenhum tenant vinculado ao seu usuário. Peça a um administrador para vincular seu acesso.");
}

// Endpoint que o frontend chama em vez de resolveTenantId/resolveScopedTenant (Supabase).
app.get("/tenant/resolve", requireJwt, async (req, res) => {
  try {
    const override = req.query.tenant_id != null ? Number(req.query.tenant_id) : undefined;
    const tenantId = await resolveTenantId(req.userId, req.role, override);
    res.json({ tenant_id: tenantId });
  } catch (e) {
    res.status(403).json({ error: String(e.message || e) });
  }
});

app.get("/my/tenants", requireJwt, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tenant_id, label, is_default FROM tenants_link
       WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 10`,
      [req.userId],
    );
    res.json({ tenants: rows.map((r) => ({ ...r, is_default: !!r.is_default })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/audit-log", requireJwt, async (req, res) => {
  const { tenant_id, action, payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "action obrigatório" });
  try {
    await pool.query(
      "INSERT INTO audit_log (id, user_id, tenant_id, action, payload) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), req.userId, tenant_id ?? null, String(action), payload ? JSON.stringify(payload) : null],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Middleware: exige role=admin (checa no banco, não confia só na claim do JWT,
// já que a role pode ter mudado depois do token emitido).
async function requireAdmin(req, res, next) {
  try {
    const role = await getUserRole(req.userId);
    if (role !== "admin") return res.status(403).json({ error: "Acesso restrito a administradores." });
    req.role = role;
    next();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

// ---------- Admin: usuários ----------
app.get("/admin/users", requireJwt, requireAdmin, async (req, res) => {
  try {
    const [profiles] = await pool.query(
      "SELECT id, nome, email, created_at FROM profiles ORDER BY created_at DESC LIMIT 500",
    );
    const ids = profiles.map((p) => p.id);
    if (!ids.length) return res.json({ users: [] });

    const [roles] = await pool.query(
      `SELECT user_id, role FROM user_roles WHERE user_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const [links] = await pool.query(
      `SELECT user_id, tenant_id, label, is_default FROM tenants_link WHERE user_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );

    res.json({
      users: profiles.map((p) => ({
        id: p.id,
        email: p.email,
        created_at: p.created_at,
        nome: p.nome,
        role: roles.find((r) => r.user_id === p.id)?.role || "cliente",
        tenants: links
          .filter((l) => l.user_id === p.id)
          .map((l) => ({ tenant_id: l.tenant_id, label: l.label, is_default: !!l.is_default })),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/admin/users", requireJwt, requireAdmin, async (req, res) => {
  const { email, password, nome, role = "cliente", tenant_id, tenant_label } = req.body || {};
  if (!email || !password || !nome) {
    return res.status(400).json({ error: "email, password e nome obrigatórios" });
  }
  if (password.length < 8) return res.status(400).json({ error: "senha deve ter ao menos 8 caracteres" });
  if (!["admin", "cliente"].includes(role)) return res.status(400).json({ error: "role inválida" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [dup] = await conn.query("SELECT id FROM profiles WHERE email = ? LIMIT 1", [email]);
    if (dup.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
    }
    const uid = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await conn.query("INSERT INTO profiles (id, nome, email, senha_hash) VALUES (?, ?, ?, ?)", [
      uid,
      nome,
      email,
      hash,
    ]);
    await conn.query("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [
      crypto.randomUUID(),
      uid,
      role,
    ]);
    if (tenant_id) {
      await conn.query(
        "INSERT INTO tenants_link (id, user_id, tenant_id, label, is_default) VALUES (?, ?, ?, ?, 1)",
        [crypto.randomUUID(), uid, Number(tenant_id), tenant_label || null],
      );
    }
    await conn.commit();
    res.json({ ok: true, id: uid });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.post("/admin/users/:id/delete", requireJwt, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  if (userId === req.userId) {
    return res.status(400).json({ error: "Você não pode remover sua própria conta." });
  }
  try {
    await pool.query("DELETE FROM profiles WHERE id = ?", [userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/admin/users/:id/role", requireJwt, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body || {};
  if (!["admin", "cliente"].includes(role)) return res.status(400).json({ error: "role inválida" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
    await conn.query("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [
      crypto.randomUUID(),
      userId,
      role,
    ]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/admin/users/:id", requireJwt, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { email, password, nome, role } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets = [];
    const vals = [];
    if (email !== undefined) {
      sets.push("email = ?");
      vals.push(email);
    }
    if (nome !== undefined) {
      sets.push("nome = ?");
      vals.push(nome);
    }
    if (password !== undefined) {
      if (String(password).length < 8) throw new Error("senha deve ter ao menos 8 caracteres");
      sets.push("senha_hash = ?");
      vals.push(await bcrypt.hash(password, 10));
    }
    if (sets.length) {
      await conn.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`, [...vals, userId]);
    }
    if (role !== undefined) {
      if (!["admin", "cliente"].includes(role)) throw new Error("role inválida");
      await conn.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
      await conn.query("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [
        crypto.randomUUID(),
        userId,
        role,
      ]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

// ---------- Admin: vínculos usuário↔tenant ----------
app.post("/admin/tenant-links", requireJwt, requireAdmin, async (req, res) => {
  const { user_id, tenant_id, label, is_default } = req.body || {};
  if (!user_id || !tenant_id) return res.status(400).json({ error: "user_id e tenant_id obrigatórios" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (is_default) {
      await conn.query("UPDATE tenants_link SET is_default = 0 WHERE user_id = ?", [user_id]);
    }
    await conn.query(
      "INSERT INTO tenants_link (id, user_id, tenant_id, label, is_default) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), user_id, Number(tenant_id), label || null, is_default ? 1 : 0],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.delete("/admin/tenant-links", requireJwt, requireAdmin, async (req, res) => {
  const { user_id, tenant_id } = req.body || {};
  if (!user_id || !tenant_id) return res.status(400).json({ error: "user_id e tenant_id obrigatórios" });
  try {
    await pool.query("DELETE FROM tenants_link WHERE user_id = ? AND tenant_id = ?", [
      user_id,
      Number(tenant_id),
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Clientes (empresas) ----------
app.get("/clientes", requireJwt, async (req, res) => {
  try {
    if (req.role === "admin") {
      const [rows] = await pool.query("SELECT * FROM clientes ORDER BY created_at DESC");
      return res.json({ clientes: rows });
    }
    const [rows] = await pool.query(
      `SELECT c.* FROM clientes c
       JOIN tenants_link tl ON tl.tenant_id = c.tenant_id
       WHERE tl.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.userId],
    );
    res.json({ clientes: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/clientes", requireJwt, requireAdmin, async (req, res) => {
  const { cnpj, razao_social, email, tenant_id, quantidade_ramais = 0 } = req.body || {};
  if (!cnpj || !razao_social || !email || !tenant_id) {
    return res.status(400).json({ error: "cnpj, razao_social, email e tenant_id obrigatórios" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO clientes (id, user_id, tenant_id, cnpj, razao_social, email, login, quantidade_ramais)
       VALUES (?, NULL, ?, ?, ?, ?, NULL, ?)`,
      [id, Number(tenant_id), cnpj, razao_social, email, Number(quantidade_ramais) || 0],
    );
    await conn.query(
      `INSERT INTO tenants (id, nome) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [Number(tenant_id), String(razao_social).slice(0, 50)],
    );
    await conn.commit();
    res.json({ ok: true, cliente: { id, tenant_id: Number(tenant_id), cnpj, razao_social, email, quantidade_ramais } });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/clientes/:id", requireJwt, requireAdmin, async (req, res) => {
  const { cnpj, razao_social, email, quantidade_ramais } = req.body || {};
  const sets = [];
  const vals = [];
  if (cnpj !== undefined) {
    sets.push("cnpj = ?");
    vals.push(cnpj);
  }
  if (razao_social !== undefined) {
    sets.push("razao_social = ?");
    vals.push(razao_social);
  }
  if (email !== undefined) {
    sets.push("email = ?");
    vals.push(email);
  }
  if (quantidade_ramais !== undefined) {
    sets.push("quantidade_ramais = ?");
    vals.push(Number(quantidade_ramais));
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(`UPDATE clientes SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/clientes/:id", requireJwt, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM clientes WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/clientes/by-tenant/:tenantId", requireJwt, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  try {
    if (req.role !== "admin") {
      const [[linked]] = await pool.query(
        "SELECT 1 AS ok FROM tenants_link WHERE user_id = ? AND tenant_id = ? LIMIT 1",
        [req.userId, tenantId],
      );
      if (!linked) return res.status(403).json({ error: "Sem permissão para este tenant." });
    }
    const [rows] = await pool.query("SELECT * FROM clientes WHERE tenant_id = ? LIMIT 1", [tenantId]);
    res.json({ cliente: rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Slug helper — only replaces spaces with "-" so pre-hyphenated inputs pass through unchanged.
function slugName(v) {
  if (v == null) return v;
  const s = String(v).trim();
  if (!s) return s;
  return /\s/.test(s) ? s.replace(/\s+/g, "-") : s;
}

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

// formata nome para uso em ids pjsip: sem espaços/acentos, mantém letras/números/_/-
function slugName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

function asteriskRx(cmd) {
  return new Promise((resolve) => {
    exec(`${ASTERISK_BIN} -rx "${cmd.replace(/"/g, '\\"')}"`, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: String(err.message || err), stderr });
      resolve({ ok: true, stdout: String(stdout || "") });
    });
  });
}

// ---------- Health ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: "1.3.0", db: "ok" });
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
        fixo: !!r.fixo,
        movel: !!r.movel,
        ddi: !!r.ddi,
        especial: !!r.especial,
        cng: !!r.cng,
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
  let { nome, ramal, senha, tronco, ddd, callerid, fixo, movel, ddi, especial, cng, transbordo, transbordo_tronco } =
    req.body || {};
  if (!ramal || !tronco || !ddd) {
    return res.status(400).json({ error: "Campos obrigatórios: ramal, tronco, ddd" });
  }
  ramal = String(ramal);
  if (!nome || String(nome).trim() === "") nome = ramal;
  nome = slugName(nome);
  if (!senha) senha = genPassword();
  const endpointId = `${tenant}${ramal}`;
  const authId = `auth-${endpointId}`;
  const transbordoInt = transbordo ? 1 : 0;
  const transbordoTroncoVal = transbordoInt && transbordo_tronco ? String(transbordo_tronco) : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`INSERT IGNORE INTO tenants (id, nome) VALUES (?, ?)`, [tenant, `tenant-${tenant}`]);

    await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [authId, endpointId, senha]);
    await conn.query(`INSERT INTO ps_aors (id) VALUES (?)`, [endpointId]);
    await conn.query(
      `INSERT INTO ps_endpoints (id, aors, auth, context, call_group, pickup_group)
       VALUES (?, ?, ?, 'Internal-default', ?, ?)`,
      [endpointId, endpointId, authId, String(tenant), String(tenant)],
    );
    await conn.query(
      `INSERT INTO ramais (tenant_id, nome, ramal, endpoint_id, senha, tronco, ddd, callerid,
                           fixo, movel, ddi, especial, cng, transbordo, transbordo_tronco)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant,
        nome,
        ramal,
        endpointId,
        senha,
        tronco,
        String(ddd),
        callerid || null,
        fixo ? 1 : 0,
        movel ? 1 : 0,
        ddi ? 1 : 0,
        especial ? 1 : 0,
        cng ? 1 : 0,
        transbordoInt,
        transbordoTroncoVal,
      ],
    );

    await conn.commit();
    amiPjsipReload();
    res.json({
      ramal: {
        ramal,
        nome,
        tronco,
        ddd: String(ddd),
        callerid,
        senha,
        fixo: !!fixo,
        movel: !!movel,
        ddi: !!ddi,
        especial: !!especial,
        cng: !!cng,
        transbordo: !!transbordoInt,
        transbordo_tronco: transbordoTroncoVal,
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
  const { nome, tronco, ddd, callerid, senha, fixo, movel, ddi, especial, cng, transbordo, transbordo_tronco } =
    req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT endpoint_id FROM ramais WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Ramal não encontrado" });
    }
    const endpointId = rows[0].endpoint_id;
    const authId = `auth-${endpointId}`;

    const sets = [];
    const vals = [];
    const pushIf = (col, val) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(val);
      }
    };
    pushIf("nome", nome !== undefined ? slugName(nome) : undefined);
    pushIf("tronco", tronco);
    if (ddd !== undefined) {
      sets.push("ddd = ?");
      vals.push(String(ddd));
    }
    pushIf("callerid", callerid);
    pushIf("senha", senha);
    if (fixo !== undefined) {
      sets.push("fixo = ?");
      vals.push(fixo ? 1 : 0);
    }
    if (movel !== undefined) {
      sets.push("movel = ?");
      vals.push(movel ? 1 : 0);
    }
    if (ddi !== undefined) {
      sets.push("ddi = ?");
      vals.push(ddi ? 1 : 0);
    }
    if (especial !== undefined) {
      sets.push("especial = ?");
      vals.push(especial ? 1 : 0);
    }
    if (cng !== undefined) {
      sets.push("cng = ?");
      vals.push(cng ? 1 : 0);
    }
    if (transbordo !== undefined) {
      sets.push("transbordo = ?");
      vals.push(transbordo ? 1 : 0);
      if (!transbordo) {
        sets.push("transbordo_tronco = ?");
        vals.push(null);
      }
    }
    if (transbordo_tronco !== undefined && transbordo !== false) {
      sets.push("transbordo_tronco = ?");
      vals.push(transbordo_tronco || null);
    }

    if (sets.length > 0) {
      await conn.query(`UPDATE ramais SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...vals, id, tenant]);
    }
    if (senha !== undefined) {
      await conn.query(`UPDATE ps_auths SET password = ? WHERE id = ?`, [senha, authId]);
    }
    await conn.commit();
    if (senha !== undefined) amiPjsipReload();
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
    const [rows] = await conn.query(`SELECT endpoint_id FROM ramais WHERE id = ? AND tenant_id = ?`, [id, tenant]);
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
    amiPjsipReload();
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
      `SELECT id, nome, tronco_pjsip, techprefix, tipo, registrar, login, senha, ip, porta, status
         FROM troncos WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    res.json({ troncos: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// status de um endpoint específico via CLI (pjsip show endpoint)
app.get("/troncos/:id/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  try {
    const [rows] = await pool.query(`SELECT tronco_pjsip FROM troncos WHERE id = ? AND tenant_id = ?`, [id, tenant]);
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

// ---------- Status em lote (ramais/troncos) via `pjsip show endpoints` ----------
// Faz um único CLI e distribui pros endpoints do tenant. Ver ASTERISK-STATUS.md.
let _endpointsCache = { at: 0, lastOk: 0, map: {} };
const ENDPOINTS_CACHE_MS = 3000;         // reusa se muito recente
const ENDPOINTS_STALE_MS = 15000;        // além disso, se AMI falhar, marca tudo como UNKNOWN
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

app.get("/ramais/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT ramal, endpoint_id FROM ramais WHERE tenant_id = ?`,
      [tenant],
    );
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

app.get("/troncos/status", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, tronco_pjsip FROM troncos WHERE tenant_id = ?`,
      [tenant],
    );
    const map = await fetchEndpointsMap();
    const endpoints = {};
    for (const row of rows) {
      endpoints[String(row.id)] = map[row.tronco_pjsip] || "Unknown";
    }
    res.json({ endpoints });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});



app.post("/troncos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { nome, ip, porta, tipo, techprefix, registrar, login, senha } = req.body || {};
  if (!nome || !ip || !tipo) {
    return res.status(400).json({ error: "nome, ip e tipo obrigatórios" });
  }
  const portaVal = String(porta || "5060");
  const slug = slugName(nome);
  if (!slug) return res.status(400).json({ error: "Nome do tronco inválido" });
  const pjsipName = `t${tenant}-${slug}`;
  const aorId = `${pjsipName}-aor`;
  const authId = `auth-${pjsipName}`;
  const idIps = `${pjsipName}-identify`;
  const regId = `${pjsipName}-reg`;
  const wantsReg = registrar === "sim" || registrar === true;
  const authPass = wantsReg ? senha || genPassword() : null;
  const authUser = wantsReg ? login || slug : null;
  if (techprefix != null && techprefix !== "" && !/^\d+$/.test(String(techprefix))) {
    return res.status(400).json({ error: "techprefix deve conter apenas números" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`INSERT INTO ps_aors (id, contact) VALUES (?, ?)`, [aorId, `sip:${ip}:${portaVal}`]);

    if (wantsReg) {
      await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [authId, authUser, authPass]);
    }

    await conn.query(
      `INSERT INTO ps_endpoints (id, aors, auth, context, from_domain)
       VALUES (?, ?, ?, 'Entrada', ?)`,
      [pjsipName, aorId, wantsReg ? authId : null, ip],
    );

    await conn.query(`INSERT INTO ps_endpoint_id_ips (id, endpoint, \`match\`) VALUES (?, ?, ?)`, [
      idIps,
      pjsipName,
      ip,
    ]);

    if (wantsReg) {
      await conn.query(
        `INSERT INTO ps_registrations (id, client_uri, server_uri, outbound_auth)
         VALUES (?, ?, ?, ?)`,
        [regId, `sip:${authUser}@${ip}:${portaVal}`, `sip:${ip}:${portaVal}`, authId],
      );
    }

    const [r] = await conn.query(
      `INSERT INTO troncos (tenant_id, nome, tronco_pjsip, techprefix, tipo, registrar, login, senha, ip, porta, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        tenant,
        nome,
        pjsipName,
        techprefix ? String(techprefix) : null,
        tipo,
        wantsReg ? "sim" : "não",
        authUser,
        authPass,
        ip,
        portaVal,
      ],
    );

    await conn.commit();
    amiPjsipReload();
    res.json({ ok: true, id: r.insertId, tronco_pjsip: pjsipName });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/troncos/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const { nome, ip, porta, tipo, techprefix, registrar, login, senha } = req.body || {};

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM troncos WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Tronco não encontrado" });
    }
    const t = rows[0];
    const oldPjsip = t.tronco_pjsip;
    const oldAor = `${oldPjsip}-aor`;
    const oldAuth = `auth-${oldPjsip}`;
    const oldIdIps = `${oldPjsip}-identify`;
    const oldReg = `${oldPjsip}-reg`;
    const wasReg = t.registrar === "sim";

    const newNome = nome ?? t.nome;
    const slug = slugName(newNome);
    const newPjsip = `t${tenant}-${slug}`;
    const newAor = `${newPjsip}-aor`;
    const newAuth = `auth-${newPjsip}`;
    const newIdIps = `${newPjsip}-identify`;
    const newReg = `${newPjsip}-reg`;
    const newIp = ip ?? t.ip;
    const newPorta = porta ? String(porta) : t.porta;
    const newTipo = tipo ?? t.tipo;
    const newTech = techprefix !== undefined ? (techprefix ? String(techprefix) : null) : t.techprefix;
    const wantsReg = registrar !== undefined ? registrar === "sim" || registrar === true : wasReg;
    const newLogin = login !== undefined ? login : t.login;
    const newSenha = senha !== undefined ? senha : t.senha;

    if (newTech != null && !/^\d+$/.test(String(newTech))) {
      await conn.rollback();
      return res.status(400).json({ error: "techprefix deve conter apenas números" });
    }

    // rename pjsip ids if name changed
    if (newPjsip !== oldPjsip) {
      await conn.query(`UPDATE ps_aors SET id = ? WHERE id = ?`, [newAor, oldAor]);
      await conn.query(`UPDATE ps_endpoints SET id = ?, aors = ? WHERE id = ?`, [newPjsip, newAor, oldPjsip]);
      await conn.query(`UPDATE ps_endpoint_id_ips SET id = ?, endpoint = ? WHERE id = ?`, [
        newIdIps,
        newPjsip,
        oldIdIps,
      ]);
      if (wasReg) {
        await conn.query(`UPDATE ps_auths SET id = ? WHERE id = ?`, [newAuth, oldAuth]);
        await conn.query(`UPDATE ps_endpoints SET auth = ?, outbound_auth = ? WHERE id = ?`, [
          newAuth,
          newAuth,
          newPjsip,
        ]);
        await conn.query(`UPDATE ps_registrations SET id = ?, outbound_auth = ? WHERE id = ?`, [
          newReg,
          newAuth,
          oldReg,
        ]);
      }
    }

    // ip/porta changes
    await conn.query(`UPDATE ps_aors SET contact = ? WHERE id = ?`, [`sip:${newIp}:${newPorta}`, newAor]);
    await conn.query(`UPDATE ps_endpoints SET from_domain = ? WHERE id = ?`, [newIp, newPjsip]);
    await conn.query(`UPDATE ps_endpoint_id_ips SET \`match\` = ? WHERE id = ?`, [newIp, newIdIps]);

    // handle registrar toggle
    if (wantsReg && !wasReg) {
      const pw = newSenha || genPassword();
      const user = newLogin || slug;
      await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [newAuth, user, pw]);
      await conn.query(`UPDATE ps_endpoints SET auth = ?, outbound_auth = ? WHERE id = ?`, [
        newAuth,
        newAuth,
        newPjsip,
      ]);
      await conn.query(`INSERT INTO ps_registrations (id, client_uri, server_uri, outbound_auth) VALUES (?, ?, ?, ?)`, [
        newReg,
        `sip:${user}@${newIp}:${newPorta}`,
        `sip:${newIp}:${newPorta}`,
        newAuth,
      ]);
    } else if (!wantsReg && wasReg) {
      await conn.query(`UPDATE ps_endpoints SET auth = NULL, outbound_auth = NULL WHERE id = ?`, [newPjsip]);
      await conn.query(`DELETE FROM ps_registrations WHERE id = ?`, [newReg]);
      await conn.query(`DELETE FROM ps_auths WHERE id = ?`, [newAuth]);
    } else if (wantsReg && wasReg) {
      // update creds/uris
      const user = newLogin || slug;
      const pw = newSenha || t.senha || genPassword();
      await conn.query(`UPDATE ps_auths SET username = ?, password = ? WHERE id = ?`, [user, pw, newAuth]);
      await conn.query(`UPDATE ps_registrations SET client_uri = ?, server_uri = ?, outbound_auth = ? WHERE id = ?`, [
        `sip:${user}@${newIp}:${newPorta}`,
        `sip:${newIp}:${newPorta}`,
        newAuth,
        newReg,
      ]);
    }

    await conn.query(
      `UPDATE troncos SET nome = ?, tronco_pjsip = ?, ip = ?, porta = ?, tipo = ?, techprefix = ?,
                          registrar = ?, login = ?, senha = ?
        WHERE id = ? AND tenant_id = ?`,
      [
        newNome,
        newPjsip,
        newIp,
        newPorta,
        newTipo,
        newTech,
        wantsReg ? "sim" : "não",
        wantsReg ? newLogin || slug : null,
        wantsReg ? newSenha || null : null,
        id,
        tenant,
      ],
    );

    await conn.commit();
    amiPjsipReload();
    res.json({ ok: true, tronco_pjsip: newPjsip });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.delete("/troncos/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT tronco_pjsip, registrar FROM troncos WHERE id = ? AND tenant_id = ?`, [
      id,
      tenant,
    ]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Tronco não encontrado" });
    }
    const pj = rows[0].tronco_pjsip;
    await conn.query(`DELETE FROM ps_registrations   WHERE id = ?`, [`${pj}-reg`]);
    await conn.query(`DELETE FROM ps_endpoint_id_ips WHERE id = ?`, [`${pj}-identify`]);
    await conn.query(`DELETE FROM ps_endpoints       WHERE id = ?`, [pj]);
    await conn.query(`DELETE FROM ps_auths           WHERE id = ?`, [`auth-${pj}`]);
    await conn.query(`DELETE FROM ps_aors            WHERE id = ?`, [`${pj}-aor`]);
    await conn.query(`DELETE FROM troncos            WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    await conn.commit();
    amiPjsipReload();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
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

// ---------- CDR queries with filters ----------
// cfg: { select, table, order, filters: { key -> column }, dateCol? }
function cdrFilteredEndpoint(p, cfg) {
  app.get(p, async (req, res) => {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const where = [`${cfg.tenantCol || "tenant_id"} = ?`];
    const vals = [tenant];
    for (const [key, col] of Object.entries(cfg.filters || {})) {
      const v = req.query[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
          if (col === "evento") {
          where.push(`${col} = ?`);
          vals.push(`%${String(v).trim()}%`);
        } else {
           where.push(`${col} LIKE ?`);
           vals.push(`%${String(v).trim()}%`);
        }
      }
    }
    if (cfg.dateCol) {
      const from = req.query.from,
        to = req.query.to;
      if (from) {
        where.push(`${cfg.dateCol} >= ?`);
        vals.push(String(from).replace("T", " "));
      }
      if (to) {
        where.push(`${cfg.dateCol} <= ?`);
        vals.push(String(to).replace("T", " "));
      }
    }
    const orderCol = cfg.order || "id";
    const sql = `SELECT ${cfg.select} FROM ${cfg.table} WHERE ${where.join(" AND ")} ORDER BY ${orderCol} DESC LIMIT ?`;
    vals.push(limit);
    try {
      const [rows] = await pool.query(sql, vals);
      res.json({ rows });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}

cdrFilteredEndpoint("/cdr/entrada", {
  select: "id, linkedid, date_time, origem, num_destino, dest_interno, duracao, status",
  table: "cdr_entrada",
  order: "date_time",
  dateCol: "date_time",
  filters: { linkedid: "linkedid", origem: "origem", destino: "num_destino", status: "status" },
});
cdrFilteredEndpoint("/cdr/ramal", {
  select: "id, linkedid, context, tipo_chamada, origem, destino, tronco, status, duracao, date_time",
  table: "cdr_ramal",
  order: "date_time",
  dateCol: "date_time",
  filters: { linkedid: "linkedid", origem: "origem", destino: "destino", status: "status" },
});
cdrFilteredEndpoint("/cdr/fila", {
  select: "id, linkedid, nome_fila, agente, ramal, evento, motivo, time_data",
  table: "cdr_fila",
  order: "time_data",
  dateCol: "time_data",
  filters: { linkedid: "linkedid", origem: "agente", destino: "ramal", status: "evento" },
});
cdrFilteredEndpoint("/cdr/ura", {
  select: "id, linkedid, num_did, nome_ura, opcao, dest_op, dest_nome",
  table: "cdr_ura",
  order: "id",
  filters: { linkedid: "linkedid", origem: "num_did", destino: "dest_op", status: "nome_ura" },
});
cdrFilteredEndpoint("/cdr/cidades/entrada", {
  select: "id, ddd, numero, sigla_estado, estado, data_hora",
  table: "cdr_cidades_entrada",
  order: "data_hora",
  dateCol: "data_hora",
  filters: { origem: "numero", destino: "numero", status: "sigla_estado" },
});
cdrFilteredEndpoint("/cdr/cidades/saida", {
  select: "id, ddd, numero, sigla_estado, estado, data_hora",
  table: "cdr_cidades_saida",
  order: "data_hora",
  dateCol: "data_hora",
  filters: { origem: "numero", destino: "numero", status: "sigla_estado" },
});

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
      `SELECT fr.id, fr.nome_ramal, fr.fila_ramal, fr.prioridade,
              r.ramal, r.nome AS ramal_display, r.callerid
         FROM filas_ramais fr
         LEFT JOIN ramais r ON r.tenant_id = ? AND r.nome = fr.nome_ramal
        WHERE fr.tenant_id = ? AND fr.fila_ramal = ?
        ORDER BY fr.prioridade, fr.id`,
      [Number(tenant), String(tenant), virtualExt],
    );

    const [queueRows] = await pool.query(`SELECT * FROM queues WHERE tenant_id = ? AND name = ? LIMIT 1`, [
      String(tenant),
      fila.name,
    ]);

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

async function ensureMoh(conn, tenant) {
  const [rows] = await conn.query(
    `SELECT 1 FROM musiconhold WHERE tenant_id = ? AND name = 'musiconhold-default' LIMIT 1`,
    [tenant],
  );
  if (!rows.length) {
    await conn.query(
      `INSERT INTO musiconhold (tenant_id, name, mode, directory) VALUES (?, 'musiconhold-default', 'files', 'default')`,
      [tenant],
    );
  }
}

app.post("/filas", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const {
    virtual_extension,
    display_name,
    description,
    strategy = "ringall",
    timeout = 15,
    active = true,
    ramais = [],
  } = req.body || {};
  if (!virtual_extension || !display_name) {
    return res.status(400).json({ error: "virtual_extension e display_name obrigatórios" });
  }
  const slug = slugName(display_name);
  const name = `q${tenant}-${slug}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // ramal virtual não pode colidir com ramais
    const [dupR] = await conn.query(`SELECT 1 FROM ramais WHERE tenant_id = ? AND ramal = ? LIMIT 1`, [
      tenant,
      String(virtual_extension),
    ]);
    if (dupR.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Já existe ramal com esse número neste tenant." });
    }
    // duplicidade de virtual_extension em filas
    const [dupF] = await conn.query(`SELECT 1 FROM filas WHERE tenant_id = ? AND virtual_extension = ? LIMIT 1`, [
      String(tenant),
      String(virtual_extension),
    ]);
    if (dupF.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Ramal virtual já cadastrado como fila." });
    }
    await ensureMoh(conn, tenant);

    await conn.query(
      `INSERT INTO filas (tenant_id, virtual_extension, name, display_name, description, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(tenant), String(virtual_extension), name, display_name, description || null, active ? 1 : 0],
    );

    await conn.query(
      `INSERT INTO queues (tenant_id, name, musiconhold, strategy, timeout)
       VALUES (?, ?, 'musiconhold-default', ?, ?)`,
      [String(tenant), name, strategy, Number(timeout) || 0],
    );

    for (const r of ramais) {
      if (!r || !r.nome_ramal) continue;
      await conn.query(`INSERT INTO filas_ramais (tenant_id, nome_ramal, fila_ramal, prioridade) VALUES (?, ?, ?, ?)`, [
        String(tenant),
        r.nome_ramal,
        String(virtual_extension),
        Number(r.prioridade) || 1,
      ]);
      await conn.query(
        `INSERT IGNORE INTO queue_members (tenant_id, queue_name, interface, penalty)
         VALUES (?, ?, ?, 0)`,
        [String(tenant), name, `Local/${virtual_extension}@VALIDAR-RAMAIS/n`],
      );
    }

    await conn.commit();
    amiQueueReloadAll();
    res.json({ ok: true, name });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/filas/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const { display_name, description, strategy, timeout, active, ramais } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM filas WHERE id = ? AND tenant_id = ?`, [id, String(tenant)]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Fila não encontrada" });
    }
    const f = rows[0];
    const oldName = f.name;
    const newDisplay = display_name ?? f.display_name;
    const newSlug = slugName(newDisplay);
    const newName = `q${tenant}-${newSlug}`;

    await conn.query(
      `UPDATE filas SET display_name = ?, description = ?, active = ?, name = ?
        WHERE id = ? AND tenant_id = ?`,
      [
        newDisplay,
        description ?? f.description,
        active === undefined ? f.active : active ? 1 : 0,
        newName,
        id,
        String(tenant),
      ],
    );

    if (newName !== oldName) {
      await conn.query(`UPDATE queues SET name = ? WHERE tenant_id = ? AND name = ?`, [
        newName,
        String(tenant),
        oldName,
      ]);
      await conn.query(`UPDATE queue_members SET queue_name = ? WHERE tenant_id = ? AND queue_name = ?`, [
        newName,
        String(tenant),
        oldName,
      ]);
    }
    if (strategy !== undefined || timeout !== undefined) {
      const sets = [];
      const vals = [];
      if (strategy !== undefined) {
        sets.push("strategy = ?");
        vals.push(strategy);
      }
      if (timeout !== undefined) {
        sets.push("timeout = ?");
        vals.push(Number(timeout) || 0);
      }
      await conn.query(`UPDATE queues SET ${sets.join(", ")} WHERE tenant_id = ? AND name = ?`, [
        ...vals,
        String(tenant),
        newName,
      ]);
    }

    if (Array.isArray(ramais)) {
      await conn.query(`DELETE FROM filas_ramais WHERE tenant_id = ? AND fila_ramal = ?`, [
        String(tenant),
        f.virtual_extension,
      ]);
      await conn.query(`DELETE FROM queue_members WHERE tenant_id = ? AND queue_name = ?`, [String(tenant), newName]);
      for (const r of ramais) {
        if (!r || !r.nome_ramal) continue;
        await conn.query(
          `INSERT INTO filas_ramais (tenant_id, nome_ramal, fila_ramal, prioridade) VALUES (?, ?, ?, ?)`,
          [String(tenant), r.nome_ramal, f.virtual_extension, Number(r.prioridade) || 1],
        );
      }
      await conn.query(
        `INSERT IGNORE INTO queue_members (tenant_id, queue_name, interface, penalty)
         VALUES (?, ?, ?, 0)`,
        [String(tenant), newName, `Local/${f.virtual_extension}@VALIDAR-RAMAIS/n`],
      );
    }

    await conn.commit();
    amiQueueReloadAll();
    res.json({ ok: true, name: newName });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.delete("/filas/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM filas WHERE id = ? AND tenant_id = ?`, [id, String(tenant)]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Fila não encontrada" });
    }
    const f = rows[0];
    await conn.query(`DELETE FROM queue_members WHERE tenant_id = ? AND queue_name = ?`, [String(tenant), f.name]);
    await conn.query(`DELETE FROM queues WHERE tenant_id = ? AND name = ?`, [String(tenant), f.name]);
    await conn.query(`DELETE FROM filas_ramais WHERE tenant_id = ? AND fila_ramal = ?`, [
      String(tenant),
      f.virtual_extension,
    ]);
    await conn.query(`DELETE FROM filas WHERE id = ? AND tenant_id = ?`, [id, String(tenant)]);
    await conn.commit();
    amiQueueReloadAll();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
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
      u.opcoes = opts.map((o) => ({ ...o, tipo_destino: String(o.tipo_destino || "").toUpperCase() }));
    }
    res.json({ uras });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/uras/audios", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const dir = path.join(URA_SOUNDS_BASE, `t${tenant}`);
  try {
    const files = await fs.readdir(dir);
    const audios = files.filter((f) => f.toLowerCase().endsWith(".wav")).map((f) => f.replace(/\.wav$/i, ""));
    res.json({ audios, dir });
  } catch (e) {
    if (e.code === "ENOENT") return res.json({ audios: [], dir, warn: "diretório inexistente" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/uras/destinos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [filas] = await pool.query(
      `SELECT virtual_extension AS value, display_name AS label FROM filas WHERE tenant_id = ? ORDER BY display_name`,
      [String(tenant)],
    );
    const [uras] = await pool.query(`SELECT id AS value, nome AS label FROM uras WHERE tenant_id = ? ORDER BY nome`, [
      tenant,
    ]);
    const [ramais] = await pool.query(
      `SELECT ramal AS value, nome AS label FROM ramais WHERE tenant_id = ? ORDER BY ramal`,
      [tenant],
    );
    const [troncos] = await pool.query(
      `SELECT nome AS value, nome AS label FROM troncos WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    const [regras] = await pool.query(
      `SELECT id AS value, nome AS label FROM regra_horario WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    let audios = [];
    try {
      const dir = path.join(URA_SOUNDS_BASE, `t${tenant}`);
      const files = await fs.readdir(dir);
      audios = files.filter((f) => f.toLowerCase().endsWith(".wav")).map((f) => f.replace(/\.wav$/i, ""));
    } catch (_) {}
    res.json({ filas, uras, ramais, troncos, regras, audios });
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
    const [dup] = await pool.query(`SELECT id FROM uras WHERE tenant_id = ? AND nome = ? LIMIT 1`, [tenant, nome]);
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
  const pushIf = (c, v, tr = (x) => x) => {
    if (v !== undefined) {
      sets.push(`${c} = ?`);
      vals.push(tr(v));
    }
  };
  pushIf("nome", nome);
  pushIf("audio", audio);
  pushIf("max_digits", max_digits, Number);
  pushIf("tentativas", tentativas, Number);
  pushIf("timeout", timeout, Number);
  if (ativo !== undefined) {
    sets.push("ativo = ?");
    vals.push(ativo ? 1 : 0);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    if (nome !== undefined) {
      const [dup] = await pool.query(`SELECT id FROM uras WHERE tenant_id = ? AND nome = ? AND id <> ? LIMIT 1`, [
        tenant,
        nome,
        id,
      ]);
      if (dup.length) return res.status(409).json({ error: "Já existe uma URA com esse nome neste tenant" });
    }
    await pool.query(`UPDATE uras SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...vals, id, tenant]);
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
    const [r] = await pool.query(`INSERT INTO ura_opcoes (ura_id, digito, tipo_destino, destino) VALUES (?, ?, ?, ?)`, [
      uraId,
      String(digito ?? ""),
      String(tipo_destino).toUpperCase(),
      String(destino),
    ]);
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
    await pool.query(
      `DELETE o FROM ura_opcoes o JOIN uras u ON u.id = o.ura_id
        WHERE o.id = ? AND u.tenant_id = ?`,
      [opcaoId, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/uras/opcoes/:opcaoId", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const opcaoId = Number(req.params.opcaoId);
  const { digito, tipo_destino, destino } = req.body || {};
  const sets = [];
  const vals = [];
  if (digito !== undefined) {
    sets.push("digito = ?");
    vals.push(String(digito));
  }
  if (tipo_destino !== undefined) {
    sets.push("tipo_destino = ?");
    vals.push(String(tipo_destino).toUpperCase());
  }
  if (destino !== undefined) {
    sets.push("destino = ?");
    vals.push(String(destino));
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(
      `UPDATE ura_opcoes o JOIN uras u ON u.id = o.ura_id
          SET ${sets.join(", ")}
        WHERE o.id = ? AND u.tenant_id = ?`,
      [...vals, opcaoId, tenant],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
// ---------- Numeros ----------
app.get("/numeros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(`SELECT id, numero, descricao FROM numeros WHERE tenant_id = ? ORDER BY numero`, [
      tenant,
    ]);
    res.json({ numeros: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/numeros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { numero, descricao } = req.body || {};
  if (!numero) return res.status(400).json({ error: "numero obrigatório" });
  try {
    const [r] = await pool.query(`INSERT INTO numeros (tenant_id, numero, descricao) VALUES (?, ?, ?)`, [
      tenant,
      String(numero),
      descricao || null,
    ]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/numeros/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { numero, descricao } = req.body || {};
  const sets = [];
  const vals = [];
  if (numero !== undefined) {
    sets.push("numero = ?");
    vals.push(String(numero));
  }
  if (descricao !== undefined) {
    sets.push("descricao = ?");
    vals.push(descricao || null);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(`UPDATE numeros SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [
      ...vals,
      Number(req.params.id),
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/numeros/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM roteamento WHERE numero_id = ? AND tenant_id = ?`, [id, tenant]);
    await pool.query(`DELETE FROM numeros WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Roteamento ----------
app.get("/roteamento", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.numero_id, r.tipo_destino, r.destino,
              n.numero, n.descricao
         FROM roteamento r
         JOIN numeros n ON n.id = r.numero_id
        WHERE r.tenant_id = ?
        ORDER BY n.numero`,
      [tenant],
    );
    res.json({ roteamento: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// If tipo_destino is HORARIO_ATENDIMENTO and destino is a name, look up regra id.
async function resolveRoteamentoDestino(tenant, tipo, destino) {
  const t = String(tipo || "").toUpperCase();
  if ( t === "REGRA_HORARIO") {
    // If already numeric, keep as-is; else resolve by name.
    if (/^\d+$/.test(String(destino))) return String(destino);
    const [rows] = await pool.query(`SELECT id FROM regra_horario WHERE tenant_id = ? AND nome = ? LIMIT 1`, [
      tenant,
      slugName(destino),
    ]);
    if (!rows.length) throw new Error("Regra de horário não encontrada");
    return String(rows[0].id);
  }
  return String(destino);
}

app.post("/roteamento", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { numero_id, tipo_destino, destino } = req.body || {};
  if (!numero_id || !tipo_destino || !destino) {
    return res.status(400).json({ error: "numero_id, tipo_destino e destino obrigatórios" });
  }
  try {
    const [own] = await pool.query(`SELECT id FROM numeros WHERE id = ? AND tenant_id = ?`, [
      Number(numero_id),
      tenant,
    ]);
    if (!own.length) return res.status(404).json({ error: "Número não pertence ao tenant" });
    const [dup] = await pool.query(`SELECT id FROM roteamento WHERE numero_id = ? AND tenant_id = ?`, [
      Number(numero_id),
      tenant,
    ]);
    if (dup.length) return res.status(409).json({ error: "Número já possui roteamento (edite)." });
    const tipo = String(tipo_destino).toUpperCase();
    const dest = await resolveRoteamentoDestino(tenant, tipo, destino);
    const [r] = await pool.query(
      `INSERT INTO roteamento (tenant_id, numero_id, tipo_destino, destino) VALUES (?, ?, ?, ?)`,
      [tenant, Number(numero_id), tipo, dest],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/roteamento/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { tipo_destino, destino } = req.body || {};
  const sets = [];
  const vals = [];
  const tipo = tipo_destino !== undefined ? String(tipo_destino).toUpperCase() : undefined;
  if (tipo !== undefined) {
    sets.push("tipo_destino = ?");
    vals.push(tipo);
  }
  if (destino !== undefined) {
    try {
      const resolved = await resolveRoteamentoDestino(tenant, tipo ?? "", destino);
      sets.push("destino = ?");
      vals.push(resolved);
    } catch (e) {
      return res.status(400).json({ error: String(e.message || e) });
    }
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(`UPDATE roteamento SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [
      ...vals,
      Number(req.params.id),
      tenant,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/roteamento/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    await pool.query(`DELETE FROM roteamento WHERE id = ? AND tenant_id = ?`, [Number(req.params.id), tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// cdr_pesquisa
app.get("/cdr/pesquisa", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  const where = ["(ps.tenant_id = ? OR ps.tenant_id IS NULL)"];
  const vals = [tenant];
  const map = { linkedid: "p.unique_id", origem: "p.numero_origem", destino: "p.ramal", status: "p.nome_fila" };
  for (const [k, col] of Object.entries(map)) {
    const v = req.query[k];
    if (v !== undefined && String(v).trim() !== "") {
      where.push(`${col} LIKE ?`);
      vals.push(`%${String(v).trim()}%`);
    }
  }
  if (req.query.from) {
    where.push("p.data >= ?");
    vals.push(String(req.query.from).replace("T", " "));
  }
  if (req.query.to) {
    where.push("p.data <= ?");
    vals.push(String(req.query.to).replace("T", " "));
  }
  vals.push(limit);
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.unique_id, p.numero_origem, p.ramal, p.agente, p.fila, p.nome_fila,
              p.pergunta_id, p.nota, p.data
         FROM cdr_pesquisa p
         LEFT JOIN pesquisa_satisfacao ps ON ps.id = p.pesquisa_id
        WHERE ${where.join(" AND ")}
        ORDER BY p.data DESC
        LIMIT ?`,
      vals,
    );
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Regra Horário (horário de atendimento personalizado) ----------
const ACAO_ENUM = ["RAMAL", "FILA", "URA", "EXTERNO", "INTERNO", "AUDIO"];

app.get("/regra-horario", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora
         FROM regra_horario WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    res.json({ regras: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function validateRegra(body) {
  const { nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora } = body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return "nome, dias, hora_inicial e hora_final obrigatórios";
  if (!ACAO_ENUM.includes(String(acao_dentro))) return "acao_dentro inválido";
  if (!ACAO_ENUM.includes(String(acao_fora))) return "acao_fora inválido";
  if (!destino_dentro || !destino_fora) return "destinos obrigatórios";
  return null;
}

app.post("/regra-horario", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const err = validateRegra(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO regra_horario (tenant_id, nome, dias, hora_inicial, hora_final, acao_dentro, destino_dentro, acao_fora, destino_fora)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant,
        slugName(String(b.nome).slice(0, 100)),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        String(b.acao_dentro).toUpperCase(),
        String(b.destino_dentro).slice(0, 100),
        String(b.acao_fora).toUpperCase(),
        String(b.destino_fora).slice(0, 100),
      ],
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/regra-horario/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const err = validateRegra(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  try {
    await pool.query(
      `UPDATE regra_horario SET nome=?, dias=?, hora_inicial=?, hora_final=?, acao_dentro=?, destino_dentro=?, acao_fora=?, destino_fora=?
       WHERE id = ? AND tenant_id = ?`,
      [
        slugName(String(b.nome).slice(0, 100)),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        String(b.acao_dentro).toUpperCase(),
        String(b.destino_dentro).slice(0, 100),
        String(b.acao_fora).toUpperCase(),
        String(b.destino_fora).slice(0, 100),
        Number(req.params.id),
        tenant,
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/regra-horario/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    await pool.query(`DELETE FROM regra_horario WHERE id = ? AND tenant_id = ?`, [Number(req.params.id), tenant]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Regra Horário para Ramais (grupo de ramais com regra de saída) ----------
app.get("/horario-ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [regras] = await pool.query(
      `SELECT id, nome, dias, hora_inicial, hora_final
         FROM regra_horario_ramais WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    // count members
    for (const r of regras) {
      const [[c]] = await pool.query(
        `SELECT COUNT(*) AS n FROM ramais_grupo_horario WHERE tenant_id = ? AND id_regra_horario = ?`,
        [tenant, r.id],
      );
      r.membros = Number(c.n) || 0;
    }
    res.json({ regras });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/horario-ramais/:id/membros", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT g.id, g.ramal, r.nome
         FROM ramais_grupo_horario g
         LEFT JOIN ramais r ON r.ramal = g.ramal AND r.tenant_id = g.tenant_id
        WHERE g.tenant_id = ? AND g.id_regra_horario = ?
        ORDER BY g.ramal`,
      [tenant, Number(req.params.id)],
    );
    res.json({ membros: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function validateHorarioRamal(body) {
  const { nome, dias, hora_inicial, hora_final } = body || {};
  if (!nome || !dias || !hora_inicial || !hora_final) return "nome, dias, hora_inicial e hora_final obrigatórios";
  return null;
}

app.post("/horario-ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const err = validateHorarioRamal(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const ramais = Array.isArray(b.ramais) ? b.ramais : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO regra_horario_ramais (tenant_id, nome, dias, hora_inicial, hora_final)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tenant,
        slugName(String(b.nome).slice(0, 100)),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
      ],
    );
    const regraId = r.insertId;
    for (const ramal of ramais) {
      if (!ramal) continue;
      await conn.query(`INSERT INTO ramais_grupo_horario (tenant_id, id_regra_horario, ramal) VALUES (?, ?, ?)`, [
        tenant,
        regraId,
        String(ramal),
      ]);
    }
    await conn.commit();
    res.json({ ok: true, id: regraId });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.put("/horario-ramais/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const err = validateHorarioRamal(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const id = Number(req.params.id);
  const ramais = Array.isArray(b.ramais) ? b.ramais : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE regra_horario_ramais
         SET nome=?, dias=?, hora_inicial=?, hora_final=?
       WHERE id = ? AND tenant_id = ?`,
      [
        slugName(String(b.nome).slice(0, 100)),
        String(b.dias).slice(0, 100),
        String(b.hora_inicial),
        String(b.hora_final),
        id,
        tenant,
      ],
    );
    if (ramais) {
      await conn.query(`DELETE FROM ramais_grupo_horario WHERE tenant_id = ? AND id_regra_horario = ?`, [tenant, id]);
      for (const ramal of ramais) {
        if (!ramal) continue;
        await conn.query(`INSERT INTO ramais_grupo_horario (tenant_id, id_regra_horario, ramal) VALUES (?, ?, ?)`, [
          tenant,
          id,
          String(ramal),
        ]);
      }
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

app.delete("/horario-ramais/:id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM ramais_grupo_horario WHERE tenant_id = ? AND id_regra_horario = ?`, [tenant, id]);
    await pool.query(`DELETE FROM regra_horario_ramais WHERE id = ? AND tenant_id = ?`, [id, tenant]);
    res.json({ ok: true });
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

