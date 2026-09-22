const express        = require("express");
const router         = express.Router();
const { randomUUID } = require("crypto");
const bcrypt         = require("bcryptjs");
const pool           = require("../config/db");
const requireJwt     = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");

router.get("/admin/users", requireJwt, requireAdmin, async (req, res) => {
  try {
    const [profiles] = await pool.query(
      "SELECT id, nome, email, created_at FROM profiles ORDER BY created_at ASC LIMIT 500",
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

router.post("/admin/users", requireJwt, requireAdmin, async (req, res) => {
  const { email, password, nome, role = "cliente", tenant_id, tenant_label } = req.body || {};
  if (!email || !password || !nome) {
    return res.status(400).json({ error: "email, password e nome obrigatórios" });
  }
  if (password.length < 8)
    return res.status(400).json({ error: "senha deve ter ao menos 8 caracteres" });
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

router.post("/admin/users/:id/delete", requireJwt, requireAdmin, async (req, res) => {
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

router.post("/admin/users/:id/role", requireJwt, requireAdmin, async (req, res) => {
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

router.put("/admin/users/:id", requireJwt, requireAdmin, async (req, res) => {
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

module.exports = router;
