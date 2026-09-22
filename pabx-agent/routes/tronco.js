const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");
const { amiPjsipReload } = require("../utils/ami-commands");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");
const genPassword = require("../utils/gen-password");

router.get("/troncos", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT tronco_pjsip, nome, techprefix, tipo, registrar, login, senha, ip, porta, status
         FROM troncos WHERE tenant_id = ? ORDER BY nome`,
      [tenant],
    );
    res.json({ troncos: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/troncos", async (req, res) => {
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

    await conn.query(`INSERT INTO ps_aors (id, contact) VALUES (?, ?)`, [
      aorId,
      `sip:${ip}:${portaVal}`,
    ]);

    if (wantsReg) {
      await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [
        authId,
        authUser,
        authPass,
      ]);
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
      `INSERT INTO troncos (tronco_pjsip, tenant_id, nome, techprefix, tipo, registrar, login, senha, ip, porta, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        pjsipName,
        tenant,
        nome,
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
    res.json({ ok: true, tronco_pjsip: pjsipName });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/troncos/:pjsip", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const pjsip = req.params.pjsip;
  const { nome, ip, porta, tipo, techprefix, registrar, login, senha } = req.body || {};

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT * FROM troncos WHERE tenant_id = ? AND tronco_pjsip = ?`,
      [tenant, pjsip],
    );
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
    const newTech =
      techprefix !== undefined ? (techprefix ? String(techprefix) : null) : t.techprefix;
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
      await conn.query(`UPDATE ps_endpoints SET id = ?, aors = ? WHERE id = ?`, [
        newPjsip,
        newAor,
        oldPjsip,
      ]);
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
    await conn.query(`UPDATE ps_aors SET contact = ? WHERE id = ?`, [
      `sip:${newIp}:${newPorta}`,
      newAor,
    ]);
    await conn.query(`UPDATE ps_endpoints SET from_domain = ? WHERE id = ?`, [newIp, newPjsip]);
    await conn.query(`UPDATE ps_endpoint_id_ips SET \`match\` = ? WHERE id = ?`, [newIp, newIdIps]);

    // handle registrar toggle
    if (wantsReg && !wasReg) {
      const pw = newSenha || genPassword();
      const user = newLogin || slug;
      await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [
        newAuth,
        user,
        pw,
      ]);
      await conn.query(`UPDATE ps_endpoints SET auth = ?, outbound_auth = ? WHERE id = ?`, [
        newAuth,
        newAuth,
        newPjsip,
      ]);
      await conn.query(
        `INSERT INTO ps_registrations (id, client_uri, server_uri, outbound_auth) VALUES (?, ?, ?, ?)`,
        [newReg, `sip:${user}@${newIp}:${newPorta}`, `sip:${newIp}:${newPorta}`, newAuth],
      );
    } else if (!wantsReg && wasReg) {
      await conn.query(`UPDATE ps_endpoints SET auth = NULL, outbound_auth = NULL WHERE id = ?`, [
        newPjsip,
      ]);
      await conn.query(`DELETE FROM ps_registrations WHERE id = ?`, [newReg]);
      await conn.query(`DELETE FROM ps_auths WHERE id = ?`, [newAuth]);
    } else if (wantsReg && wasReg) {
      // update creds/uris
      const user = newLogin || slug;
      const pw = newSenha || t.senha || genPassword();
      await conn.query(`UPDATE ps_auths SET username = ?, password = ? WHERE id = ?`, [
        user,
        pw,
        newAuth,
      ]);
      await conn.query(
        `UPDATE ps_registrations SET client_uri = ?, server_uri = ?, outbound_auth = ? WHERE id = ?`,
        [`sip:${user}@${newIp}:${newPorta}`, `sip:${newIp}:${newPorta}`, newAuth, newReg],
      );
    }

    await conn.query(
      `UPDATE troncos SET tronco_pjsip = ?, nome = ?, ip = ?, porta = ?, tipo = ?, techprefix = ?,
                          registrar = ?, login = ?, senha = ?
        WHERE tenant_id = ? AND tronco_pjsip = ?`,
      [
        newPjsip,
        newNome,
        newIp,
        newPorta,
        newTipo,
        newTech,
        wantsReg ? "sim" : "não",
        wantsReg ? newLogin || slug : null,
        wantsReg ? newSenha || null : null,
        tenant,
        oldPjsip,
      ],
    );

    if (newPjsip !== oldPjsip) {
      await conn.query(
        `UPDATE ramais
         SET tronco = ?
         WHERE tenant_id = ?
         AND tronco = ?`,
        [newPjsip, tenant, oldPjsip],
      );
    }

    const mudouNomeOuIp = newPjsip !== oldPjsip || newIp !== t.ip;
    const mudouEstadoReg = wantsReg !== wasReg;
    const mudouDadosReg =
      wantsReg &&
      wasReg &&
      ((newSenha && newSenha !== t.senha) || (newLogin && newLogin !== t.login));
    const precisaReload = mudouNomeOuIp || mudouEstadoReg || mudouDadosReg;

    await conn.commit();

    if (precisaReload) amiPjsipReload();

    res.json({ ok: true, tronco_pjsip: newPjsip });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.delete("/troncos/:pjsip", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const pjsip = req.params.pjsip;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT tronco_pjsip, registrar FROM troncos WHERE tenant_id = ? AND tronco_pjsip = ?`,
      [tenant, pjsip],
    );
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
    await conn.query(`DELETE FROM troncos            WHERE tenant_id = ? AND tronco_pjsip = ?`, [
      tenant,
      pjsip,
    ]);
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

module.exports = router;
