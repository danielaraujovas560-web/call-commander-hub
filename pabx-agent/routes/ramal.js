const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const { requireAdmin } = require("../middleware/admin");
const { amiPjsipReload } = require("../utils/ami-commands");
const genPassword = require("../utils/gen-password");

router.get("/ramais", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT r.ramal, r.nome AS ramal_nome, r.tronco, t.nome AS tronco_nome, r.ddd, r.callerid, r.senha,
              r.fixo, r.movel, r.ddi, r.especial, r.cng, r.endpoint_id,
              r.gravacao, r.transbordo, r.transbordo_tronco, r.pesquisa, r.pesquisa_id,
              (SELECT COUNT (*) FROM cdr_ramal c WHERE c.tenant_id = ? AND c.origem = r.endpoint_id AND tipo_chamada = 'Saida' AND c.date_time >= CURDATE()) AS ligacoes_feitas,
              ((SELECT COUNT(*) FROM cdr_ramal c WHERE c.tenant_id = ? AND c.destino = r.endpoint_id AND c.tipo_chamada = 'Entrada' AND c.date_time >= CURDATE() ) +
              COALESCE(( SELECT COUNT(DISTINCT c.linkedid) FROM cdr_fila c WHERE c.tenant_id = ? AND c.ramal = r.endpoint_id AND c.time_data >= CURDATE()), 0)) AS ligacoes_recebidas
         FROM ramais r LEFT JOIN troncos t
        ON r.tronco = t.tronco_pjsip AND r.tenant_id = t.tenant_id
        WHERE r.tenant_id = ?  ORDER BY ramal`,
      [tenant, tenant, tenant, tenant],
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
  const tenant = req.tenantId;
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

router.post("/ramais/lote", async (req, res) => {
  console.log("Entrou no post");

  const tenant = req.tenantId;
  if (!tenant) {
    return res.status(401).json({ error: "Tenant não identificado" });
  }

  let {
    ramal_inicial,
    quantidade,
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

  // ------------------------------------------------------------
  // Validação básica
  // ------------------------------------------------------------

  ramal_inicial = String(ramal_inicial || "").trim();
  quantidade = Number(quantidade);

  if (!/^\d{3,6}$/.test(ramal_inicial)) {
    return res.status(400).json({
      error: "Ramal inicial deve ter entre 3 e 6 dígitos",
    });
  }

  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({
      error: "Quantidade deve ser um número inteiro positivo",
    });
  }

  if (quantidade > 1000) {
    return res.status(400).json({
      error: "Quantidade máxima de 1000 ramais por lote",
    });
  }

  if (!tronco || !ddd) {
    return res.status(400).json({
      error: "Campos obrigatórios: tronco e ddd",
    });
  }

  // ------------------------------------------------------------
  // Calcula a faixa
  // ------------------------------------------------------------

  const primeiro = Number(ramal_inicial);
  const ultimo = primeiro + quantidade - 1;

  if (String(ultimo).length > 6) {
    return res.status(400).json({
      error: "A faixa de ramais ultrapassa o limite de 6 dígitos",
    });
  }

  const ramais = [];

  for (let i = 0; i < quantidade; i++) {
    ramais.push(String(primeiro + i));
  }

  // ------------------------------------------------------------
  // Configurações comuns
  // ------------------------------------------------------------

  const transbordoInt = transbordo ? 1 : 0;

  const transbordoTroncoVal = transbordoInt && transbordo_tronco ? String(transbordo_tronco) : null;

  const pesquisaInt = pesquisa ? 1 : 0;

  const pesquisaIdVal = pesquisaInt && pesquisa_id ? Number(pesquisa_id) : null;

  const conn = await pool.getConnection();

  try {
    // ----------------------------------------------------------
    // Verifica colisões ANTES de criar qualquer coisa
    // ----------------------------------------------------------

    const placeholders = ramais.map(() => "?").join(",");

    const [existentes] = await conn.query(
      `SELECT ramal
         FROM ramais
        WHERE tenant_id = ?
          AND ramal IN (${placeholders})`,
      [tenant, ...ramais],
    );

    if (existentes.length > 0) {
      const colididos = existentes.map((row) => String(row.ramal));

      return res.status(409).json({
        error: "Um ou mais ramais já existem",
        ramais: colididos,
      });
    }

    // ----------------------------------------------------------
    // Transaction
    // ----------------------------------------------------------

    await conn.beginTransaction();

    await conn.query(
      `INSERT IGNORE INTO tenants (id, nome)
       VALUES (?, ?)`,
      [tenant, `tenant-${tenant}`],
    );

    const criados = [];

    // ----------------------------------------------------------
    // Criação dos ramais
    // ----------------------------------------------------------

    for (const ramal of ramais) {
      const nome = ramal;
      const senha = genPassword();

      const endpointId = `${tenant}${ramal}`;
      const authId = `auth-${endpointId}`;

      // -------------------------
      // PJSIP principal
      // -------------------------

      await conn.query(
        `INSERT INTO ps_auths
          (id, username, password)
         VALUES (?, ?, ?)`,
        [authId, endpointId, senha],
      );

      await conn.query(
        `INSERT INTO ps_aors
          (id)
         VALUES (?)`,
        [endpointId],
      );

      await conn.query(
        `INSERT INTO ps_endpoints
          (
            id,
            aors,
            auth,
            context,
            call_group,
            pickup_group
          )
         VALUES
          (?, ?, ?, 'Internal-default', ?, ?)`,
        [endpointId, endpointId, authId, String(tenant), String(tenant)],
      );

      // -------------------------
      // Registro do ramal
      // -------------------------

      await conn.query(
        `INSERT INTO ramais
          (
            endpoint_id,
            tenant_id,
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
            pesquisa_id
          )
         VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

      // -------------------------
      // Endpoint WebRTC
      // -------------------------

      const webEndpointId = `${endpointId}-web`;
      const webAuthId = `auth-${webEndpointId}`;

      await conn.query(
        `INSERT INTO ps_auths
          (id, username, password)
         VALUES (?, ?, ?)`,
        [webAuthId, webEndpointId, senha],
      );

      await conn.query(
        `INSERT INTO ps_aors
          (id)
         VALUES (?)`,
        [webEndpointId],
      );

      await conn.query(
        `INSERT INTO ps_endpoints
          (
            id,
            transport,
            aors,
            auth,
            context,
            call_group,
            pickup_group,
            webrtc,
            media_encryption,
            dtls_auto_generate_cert,
            ice_support,
            use_avpf,
            rtcp_mux
          )
         VALUES
          (
            ?,
            'transport-wss',
            ?,
            ?,
            'Internal-default',
            ?,
            ?,
            'yes',
            'dtls',
            'yes',
            'yes',
            'yes',
            'yes'
          )`,
        [webEndpointId, webEndpointId, webAuthId, String(tenant), String(tenant)],
      );

      criados.push({
        ramal,
        nome,
        tronco,
        ddd: String(ddd),
        callerid: callerid || null,
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
      });
    }

    await conn.commit();

    amiPjsipReload();

    return res.json({
      ramais: criados,
      quantidade: criados.length,
    });
  } catch (e) {
    await conn.rollback();

    console.error("Erro ao criar ramais em lote:", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  } finally {
    conn.release();
  }
});

router.put("/ramais/:endpoint_id", async (req, res) => {
  const tenant = req.tenantId;
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

router.delete("/ramais/lote", async (req, res) => {
  console.log("Entrou no delete lote");
  const tenant = req.tenantId;

  if (!tenant) {
    return res.status(401).json({
      error: "Tenant não identificado",
    });
  }

  const { endpoint_ids } = req.body || {};

  if (!Array.isArray(endpoint_ids) || endpoint_ids.length === 0) {
    return res.status(400).json({
      error: "Informe ao menos um endpoint",
    });
  }

  if (endpoint_ids.length > 1000) {
    return res.status(400).json({
      error: "Quantidade máxima de 1000 ramais por lote",
    });
  }

  const endpoints = endpoint_ids.map((id) => String(id).trim()).filter(Boolean);

  console.log("Antes do conn");

  const conn = await pool.getConnection();

  console.log("Antes do try catch");
  try {
    await conn.beginTransaction();

    let quantidade = 0;

    for (const endpointId of endpoints) {
      const webEndpointId = `${endpointId}-web`;

      console.log("🗑️ Apagando ramal:", {
        tenant,
        endpointId,
        webEndpointId,
      });

      // Primeiro verifica/apaga o registro principal do ramal
      const [resultRamal] = await conn.query(
        `DELETE FROM ramais
         WHERE endpoint_id = ?
           AND tenant_id = ?`,
        [endpointId, tenant],
      );

      console.log(`Ramal ${endpointId}: ${resultRamal.affectedRows} registro(s) apagado(s)`);

      if (resultRamal.affectedRows > 0) {
        quantidade += resultRamal.affectedRows;
      }

      // PJSIP principal
      await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [endpointId]);

      await conn.query(`DELETE FROM ps_auths WHERE id = ?`, [`auth-${endpointId}`]);

      await conn.query(`DELETE FROM ps_aors WHERE id = ?`, [endpointId]);

      // WebRTC
      await conn.query(`DELETE FROM ps_endpoints WHERE id = ?`, [webEndpointId]);

      await conn.query(`DELETE FROM ps_auths WHERE id = ?`, [`auth-${webEndpointId}`]);

      await conn.query(`DELETE FROM ps_aors WHERE id = ?`, [webEndpointId]);
    }

    await conn.commit();

    amiPjsipReload();

    console.log("✅ Lote apagado:", {
      tenant,
      solicitados: endpoints.length,
      apagados: quantidade,
    });

    return res.json({
      ok: true,
      quantidade,
      endpoint_ids: endpoints,
    });
  } catch (e) {
    await conn.rollback();

    console.log("Falhou o delete em lote");
    console.error("❌ Erro ao apagar ramais em lote:", e);

    return res.status(500).json({
      error: String(e.message || e),
    });
  } finally {
    conn.release();
  }
});

router.delete("/ramais/:endpoint_id", async (req, res) => {
  console.log("Entrou no delete simples");
  const tenant = req.tenantId;
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
  const tenant = req.tenantId;
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
