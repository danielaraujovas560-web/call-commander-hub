const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");
const { amiPjsipReload } = require("../utils/ami-commands");
const { getTenant } = require("../utils/tenant");
const genPassword = require("../utils/gen-password")

router.get("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT r.ramal, r.nome AS ramal_nome, r.tronco, t.nome AS tronco_nome, r.ddd, r.callerid, r.senha,
              r.fixo, r.movel, r.ddi, r.especial, r.cng, r.endpoint_id,
              r.gravacao, r.transbordo, r.transbordo_tronco, r.pesquisa, r.pesquisa_id,
              (SELECT COUNT (*) FROM cdr_ramal c WHERE c.tenant_id = ? AND c.origem = r.endpoint_id AND DATE(date_time) = CURDATE()) AS ligacoes_feitas,
              (SELECT COUNT (*) FROM cdr_ramal c WHERE c.tenant_id = ? AND c.destino = r.endpoint_id AND DATE(date_time) = CURDATE()) AS ligacoes_recebidas
         FROM ramais r LEFT JOIN troncos t
        ON r.tronco = t.tronco_pjsip AND r.tenant_id = t.tenant_id
        WHERE r.tenant_id = ?  ORDER BY ramal`,
      [tenant, tenant, tenant],
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
        gravacao: !!r.gravacao,
        transbordo: !!r.transbordo,
        pesquisa: !!r.pesquisa,

        ligacoes_feitas: Number(r.ligacoes_feitas),
        ligacoes_recebidas: Number(r.ligacoes_recebidas),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/ramais", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  let {
    nome,
    ramal,
    senha,
    tronco,
    ddd,
    callerid,
    fixo,
    movel,
    ddi,
    especial,
    cng,
    gravacao,
    transbordo,
    transbordo_tronco,
    pesquisa,
    pesquisa_id,
  } = req.body || {};
  if (!ramal || !tronco || !ddd) {
    return res.status(400).json({ error: "Campos obrigatórios: ramal, tronco, ddd" });
  }
  ramal = String(ramal);
  if (!nome || String(nome).trim() === "") nome = ramal;
  nome = String(nome).trim();
  if (!senha) senha = genPassword();
  const endpointId = `${tenant}${ramal}`;
  const authId = `auth-${endpointId}`;
  const transbordoInt = transbordo ? 1 : 0;
  const transbordoTroncoVal = transbordoInt && transbordo_tronco ? String(transbordo_tronco) : null;
  const pesquisaInt = pesquisa ? 1 : 0;
  const pesquisaIdVal = pesquisaInt && pesquisa_id ? Number(pesquisa_id) : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`INSERT IGNORE INTO tenants (id, nome) VALUES (?, ?)`, [
      tenant,
      `tenant-${tenant}`,
    ]);

    await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [
      authId,
      endpointId,
      senha,
    ]);
    await conn.query(`INSERT INTO ps_aors (id) VALUES (?)`, [endpointId]);
    await conn.query(
      `INSERT INTO ps_endpoints (id, aors, auth, context, call_group, pickup_group)
       VALUES (?, ?, ?, 'Internal-default', ?, ?)`,
      [endpointId, endpointId, authId, String(tenant), String(tenant)],
    );
    await conn.query(
      `INSERT INTO ramais (endpoint_id, tenant_id, nome, ramal, senha, tronco, ddd, callerid,
                           fixo, movel, ddi, especial, cng, gravacao, transbordo, transbordo_tronco, pesquisa, pesquisa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        endpointId,
        tenant,
        nome,
        ramal,
        senha,
        tronco,
        String(ddd),
        callerid || null,
        fixo ? 1 : 0,
        movel ? 1 : 0,
        ddi ? 1 : 0,
        especial ? 1 : 0,
        cng ? 1 : 0,
        gravacao ? 1 : 0,
        transbordoInt,
        transbordoTroncoVal,
        pesquisaInt,
        pesquisaIdVal,
      ],
    );

    const webEndpointId = `${endpointId}-web`;
    const webAuthId = `auth-${webEndpointId}`;

    await conn.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [
      webAuthId,
      webEndpointId,
      senha,
    ]);

    await conn.query(`INSERT INTO ps_aors (id) VALUES (?)`, [webEndpointId]);

    await conn.query(
      `INSERT INTO ps_endpoints (
          id, transport, aors, auth, context, call_group, pickup_group, webrtc, media_encryption, dtls_auto_generate_cert, ice_support, use_avpf, rtcp_mux
      ) VALUES (?, 'transport-wss', ?, ?, 'Internal-default', ?, ?, 'yes', 'dtls', 'yes', 'yes', 'yes', 'yes')`,
      [webEndpointId, webEndpointId, webAuthId, String(tenant), String(tenant)],
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
        gravacao: !!gravacao,
        transbordo: !!transbordoInt,
        transbordo_tronco: transbordoTroncoVal,
        pesquisa: !!pesquisaInt,
        pesquisa_id: pesquisaIdVal,
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

router.put("/ramais/:endpoint_id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const endpointId = req.params.endpoint_id;
  if (!endpointId) {
    return res.status(400).json({ error: "endpoint inválido" });
  }
  const {
    nome,
    tronco,
    ddd,
    callerid,
    senha,
    fixo,
    movel,
    ddi,
    especial,
    cng,
    gravacao,
    transbordo,
    transbordo_tronco,
    pesquisa,
    pesquisa_id,
  } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const authId = `auth-${endpointId}`;

    const sets = [];
    const vals = [];
    const pushIf = (col, val) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(val);
      }
    };
    pushIf("nome", nome !== undefined ? String(nome).trim() : undefined);
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
    if (gravacao !== undefined) {
      sets.push("gravacao = ?");
      vals.push(gravacao ? 1 : 0);
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
    if (pesquisa !== undefined) {
      const pesquisaIntUpdate = pesquisa ? 1 : 0;
      const pesquisaIdUpdate = pesquisaIntUpdate && pesquisa_id ? Number(pesquisa_id) : null;
      sets.push("pesquisa = ?");
      vals.push(pesquisaIntUpdate);
      sets.push("pesquisa_id = ?");
      vals.push(pesquisaIdUpdate);
    } else if (pesquisa_id !== undefined) {
      sets.push("pesquisa_id = ?");
      vals.push(pesquisa_id || null);
    }
    if (sets.length > 0) {
      await conn.query(
        `UPDATE ramais SET ${sets.join(", ")} WHERE endpoint_id = ? AND tenant_id = ?`,
        [...vals, endpointId, tenant],
      );
    }
    if (senha !== undefined) {
      await conn.query(`UPDATE ps_auths SET password = ? WHERE id = ?`, [senha, authId]);
      await conn.query(`UPDATE ps_auths SET password = ? WHERE id = ?`, [
        senha,
        `auth-${endpointId}-web`,
      ]);
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

router.delete("/ramais/:endpoint_id", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const endpointId = req.params.endpoint_id;
  if (!endpointId) {
    return res.status(400).json({ error: "endpoint inválido" });
  }
  const webEndpointId = `${endpointId}-web`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const authId = `auth-${endpointId}`;
    await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ps_auths     WHERE id = ?`, [authId]);
    await conn.query(`DELETE FROM ps_aors      WHERE id = ?`, [endpointId]);
    await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [webEndpointId]);
    await conn.query(`DELETE FROM ps_auths     WHERE id = ?`, [`auth-${webEndpointId}`]);
    await conn.query(`DELETE FROM ps_aors      WHERE id = ?`, [webEndpointId]);
    await conn.query(`DELETE FROM ramais       WHERE endpoint_id = ? AND tenant_id = ?`, [
      endpointId,
      tenant,
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

router.post("/ramais/generate-password", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const endpointId = req.body.endpoint_id;
  if (!endpointId) return res.status(400).json({ error: "endpoint inválido" });

  function genPassword() {
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(12);
    let senha = "";
    for (let i = 0; i < 12; i++) {
      senha += chars[bytes[i] % chars.length];
    }
    return senha;
  }

  const senha = genPassword();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const webEndpointId = `${endpointId}-web`;
    await conn.query(`UPDATE ramais SET senha = ? WHERE tenant_id = ? AND endpoint_id = ?`, [
      senha,
      tenant,
      endpointId,
    ]);
    await conn.query(`UPDATE ps_auths SET password = ? WHERE username = ? AND id = ?`, [
      senha,
      endpointId,
      `auth-${endpointId}`,
    ]);
    await conn.query(`UPDATE ps_auths SET password = ? WHERE username = ? AND id = ?`, [
      senha,
      webEndpointId,
      `auth-${webEndpointId}`,
    ]);
    await conn.commit();

    return res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

module.exports = router;
