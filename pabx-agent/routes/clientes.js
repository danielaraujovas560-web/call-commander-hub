const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomUUID } = require("crypto");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");
const { amiPjsipReload, amiQueueReloadParameters } = require("../utils/ami-commands");

router.get("/clientes", requireJwt, async (req, res) => {
  try {
    if (req.role === "admin") {
      const [rows] = await pool.query("SELECT * FROM clientes ORDER BY created_at ASC");
      return res.json({ clientes: rows.map((c) => ({ ...c, ativo: !!c.ativo })) });
    }
    const [rows] = await pool.query(
      `SELECT c.* FROM clientes c
       JOIN tenants_link tl ON tl.tenant_id = c.tenant_id
       WHERE tl.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.userId],
    );
    res.json({ clientes: rows.map((c) => ({ ...c, ativo: !!c.ativo })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/clientes", requireJwt, requireAdmin, async (req, res) => {
  const { cnpj, razao_social, email, tenant_id, quantidade_ramais = 0 } = req.body || {};
  if (!cnpj || !razao_social || !email || !tenant_id) {
    return res.status(400).json({ error: "cnpj, razao_social, email e tenant_id obrigatórios" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = randomUUID();
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
    res.json({
      ok: true,
      cliente: { id, tenant_id: Number(tenant_id), cnpj, razao_social, email, quantidade_ramais },
    });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/clientes/:id", requireJwt, requireAdmin, async (req, res) => {
  const { cnpj, razao_social, email, ativo } = req.body || {};
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
  let mudouAtivo = false;
  if (ativo !== undefined) {
    const novoAtivo = ativo ? 1 : 0;

    const [rows] = await pool.query("SELECT ativo FROM clientes WHERE id = ?", [req.params.id]);

    if (rows.length > 0) {
      const ativoAtual = Number(rows[0].ativo);
      if (ativoAtual !== novoAtivo) {
        mudouAtivo = true;
      }
    }
    sets.push("ativo = ?");
    vals.push(novoAtivo);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(`UPDATE clientes SET ${sets.join(", ")} WHERE id = ?`, [
      ...vals,
      req.params.id,
    ]);

    if (mudouAtivo) {
      amiPjsipReload();
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/clientes/:id/configuracoes", requireJwt, requireAdmin, async (req, res) => {
  const { quantidade_ramais, quantidade_filas, quantidade_uras } = req.body || {};
  const sets = [];
  const vals = [];
  if (quantidade_ramais !== undefined) {
    sets.push("quantidade_ramais = ?");
    vals.push(quantidade_ramais);
  }
  if (quantidade_filas !== undefined) {
    sets.push("quantidade_filas = ?");
    vals.push(quantidade_filas);
  }
  if (quantidade_uras !== undefined) {
    sets.push("quantidade_uras = ?");
    vals.push(quantidade_uras);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    await pool.query(`UPDATE clientes SET ${sets.join(", ")} WHERE id = ?`, [
      ...vals,
      req.params.id,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/clientes/:id", requireJwt, requireAdmin, async (req, res) => {
  const clienteId = req.params.id;
  const conn = await pool.getConnection();
  try {
    const [[cliente]] = await conn.query("SELECT tenant_id FROM clientes WHERE id = ? LIMIT 1", [
      clienteId,
    ]);
    if (!cliente) return res.status(404).json({ error: "Cliente não encontrado" });
    const tenant = cliente.tenant_id;

    await conn.beginTransaction();

    // --- Fase 1: coletar tudo que precisa de limpeza no Asterisk ANTES de apagar ---
    const [ramaisRows] = await conn.query("SELECT endpoint_id FROM ramais WHERE tenant_id = ?", [
      tenant,
    ]);
    const [troncosRows] = await conn.query(
      "SELECT tronco_pjsip, registrar FROM troncos WHERE tenant_id = ?",
      [tenant],
    );
    const [filasRows] = await conn.query("SELECT name FROM filas WHERE tenant_id = ?", [tenant]);
    const [agentesRows] = await conn.query(
      "SELECT queue, interface FROM filas_agentes WHERE tenant_id = ?",
      [tenant],
    );

    // --- Fase 2: apagar do banco (ordem respeita dependências) ---
    await conn.query(
      "DELETE FROM ura_opcoes WHERE ura_identifier IN (SELECT ura_identifier FROM uras WHERE tenant_id = ?)",
      [tenant],
    );
    await conn.query("DELETE FROM uras WHERE tenant_id = ?", [tenant]);

    await conn.query("DELETE FROM filas_agentes WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM filas_agentes WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM queues WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM filas WHERE tenant_id = ?", [tenant]);

    await conn.query("DELETE FROM ramais_grupo_horario WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM regra_horario_ramais WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM regra_horario WHERE tenant_id = ?", [tenant]);

    await conn.query("DELETE FROM roteamento WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM blacklist WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM musiconhold WHERE tenant_id = ?", [tenant]);

    for (const r of ramaisRows) {
      await conn.query("DELETE FROM ps_endpoints WHERE id = ?", [r.endpoint_id]);
      await conn.query("DELETE FROM ps_auths WHERE id = ?", [`auth-${r.endpoint_id}`]);
      await conn.query("DELETE FROM ps_aors WHERE id = ?", [r.endpoint_id]);
    }
    await conn.query("DELETE FROM ramais WHERE tenant_id = ?", [tenant]);

    for (const t of troncosRows) {
      const pj = t.tronco_pjsip;
      await conn.query("DELETE FROM ps_registrations WHERE id = ?", [`${pj}-reg`]);
      await conn.query("DELETE FROM ps_endpoint_id_ips WHERE id = ?", [`${pj}-identify`]);
      await conn.query("DELETE FROM ps_endpoints WHERE id = ?", [pj]);
      await conn.query("DELETE FROM ps_auths WHERE id = ?", [`auth-${pj}`]);
      await conn.query("DELETE FROM ps_aors WHERE id = ?", [`${pj}-aor`]);
    }
    await conn.query("DELETE FROM troncos WHERE tenant_id = ?", [tenant]);

    // CDR: cdr_pesquisa depende de pesquisa_satisfacao.id, o resto tem tenant_id direto.
    await conn.query(
      "DELETE FROM cdr_pesquisa WHERE pesquisa_id IN (SELECT id FROM pesquisa_satisfacao WHERE tenant_id = ?)",
      [tenant],
    );
    await conn.query("DELETE FROM pesquisa_satisfacao WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM cdr_ramal WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM cdr_fila WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM cdr_ura WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM cdr_cidades_entrada WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM cdr_cidades_saida WHERE tenant_id = ?", [tenant]);

    // Identidade: desvincula usuários e apaga o registro do tenant.
    await conn.query("DELETE FROM tenants_link WHERE tenant_id = ?", [tenant]);
    await conn.query("DELETE FROM tenants WHERE id = ?", [tenant]);

    await conn.query("DELETE FROM clientes WHERE id = ?", [clienteId]);

    await conn.commit();

    // --- Fase 3: limpeza no Asterisk via AMI (best-effort, já com o banco consistente) ---
    for (const a of agentesRows) {
      try {
        await queueRemove({ queue: a.queue, interface: a.interface });
      } catch (e) {
        console.error(
          `[ami] remover agente ${a.interface} da fila ${a.queue} falhou:`,
          e.message || e,
        );
      }
    }
    for (const f of filasRows) {
      await amiQueueReloadParameters(f.name);
    }
    await amiPjsipReload();

    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.get("/clientes/by-tenant/:tenantId", requireJwt, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  try {
    if (req.role !== "admin") {
      const [[linked]] = await pool.query(
        "SELECT 1 AS ok FROM tenants_link WHERE user_id = ? AND tenant_id = ? LIMIT 1",
        [req.userId, tenantId],
      );
      if (!linked) return res.status(403).json({ error: "Sem permissão para este tenant." });
    }
    const [rows] = await pool.query("SELECT * FROM clientes WHERE tenant_id = ? LIMIT 1", [
      tenantId,
    ]);
    const cliente = rows[0] ? { ...rows[0], ativo: !!rows[0].ativo } : null;
    res.json({ cliente });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
