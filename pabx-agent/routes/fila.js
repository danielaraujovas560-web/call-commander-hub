const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const requireJwt = require("../middleware/jwt");
const { requireAdmin } = require("../middleware/admin");
const { amiQueueReloadParameters,  } = require("../utils/ami-commands");
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");
const { amiCommand, queueAdd, queueRemove, queuePenalty, queueRefresh } = require("../ami.js");

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

const QUEUE_STRATEGIES = ["ringall", "rrmemory", "leastrecent", "fewestcalls", "random"];

router.get("/filas", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  try {
    const [rows] = await pool.query(
      `SELECT f.name, f.display_name, f.fila_timeout, f.description, f.gravacao,
              f.pesquisa, f.pesquisa_id, f.ativo,
              q.strategy, q.timeout, q.ringinuse, q.retry, q.maxlen, q.musiconhold,
              (SELECT COUNT(*) FROM filas_agentes fa
                 WHERE fa.tenant_id = f.tenant_id AND fa.queue = f.name) AS membros
         FROM filas f
         LEFT JOIN queues q ON q.tenant_id = f.tenant_id AND q.name = f.name
        WHERE f.tenant_id = ?
        ORDER BY f.created_at ASC`,
      [String(tenant)],
    );
    res.json({
      filas: rows.map((r) => ({
        ...r,
        gravacao: !!r.gravacao,
        ativo: !!r.ativo,
        pesquisa: !!r.pesquisa,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/filas", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const {
    display_name,
    description,
    strategy = "ringall",
    timeout = 15,
    retry = 5,
    ringinuse = "no",
    fila_timeout,
    gravacao = false,
    ativo = true,
    pesquisa = false,
    pesquisa_id,
  } = req.body || {};
  if (!display_name) {
    return res.status(400).json({ error: "display_name obrigatório" });
  }
  if (!QUEUE_STRATEGIES.includes(strategy)) {
    return res.status(400).json({ error: "Estratégia inválida" });
  }
  const slug = slugName(display_name);
  const name = `q${tenant}-${slug}`;
  const pesquisaInt = pesquisa ? 1 : 0;
  const pesquisaIdVal = pesquisaInt && pesquisa_id ? Number(pesquisa_id) : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dupF] = await conn.query(
      `SELECT 1 FROM filas WHERE tenant_id = ? AND name = ? LIMIT 1`,
      [String(tenant), name],
    );
    if (dupF.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Já existe uma fila com esse nome neste tenant." });
    }

    await ensureMoh(conn, tenant);

    await conn.query(
      `INSERT INTO filas (tenant_id, name, display_name, fila_timeout, description, gravacao, ativo, pesquisa, pesquisa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(tenant),
        name,
        display_name,
        fila_timeout || null,
        description || null,
        gravacao ? 1 : 0,
        ativo ? 1 : 0,
        pesquisaInt,
        pesquisaIdVal,
      ],
    );

    await conn.query(
      `INSERT INTO queues (tenant_id, name, musiconhold, strategy, timeout, retry, ringinuse)
       VALUES (?, ?, 'musiconhold-default', ?, ?, ?, ?)`,
      [String(tenant), name, strategy, Number(timeout) || 0, Number(retry), ringinuse ?? "no"],
    );

    await conn.commit();
    await amiQueueReloadParameters(name);
    // Gestão de agentes (filas_agentes + QueueAdd) fica para a próxima etapa.
    res.json({ ok: true, name });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/filas/:name", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const name = req.params.name;
  const {
    display_name,
    description,
    strategy,
    timeout,
    fila_timeout,
    retry,
    ringinuse,
    gravacao,
    ativo,
    pesquisa,
    pesquisa_id,
  } = req.body || {};
  if (strategy !== undefined && !QUEUE_STRATEGIES.includes(strategy)) {
    return res.status(400).json({ error: "Estratégia inválida" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM filas WHERE name = ? AND tenant_id = ?`, [
      name,
      String(tenant),
    ]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Fila não encontrada" });
    }
    const f = rows[0];
    const oldName = f.name;
    const newDisplay = display_name ?? f.display_name;
    const newSlug = slugName(newDisplay);
    const newName = `q${tenant}-${newSlug}`;
    const nameChanged = newName !== oldName;

    if (nameChanged) {
      const [dupF] = await conn.query(
        `SELECT 1 FROM filas WHERE tenant_id = ? AND name = ? LIMIT 1`,
        [String(tenant), newName],
      );
      if (dupF.length) {
        await conn.rollback();
        return res.status(409).json({ error: "Já existe uma fila com esse nome neste tenant." });
      }
    }

    let pesquisaIntUpdate = f.pesquisa;
    let pesquisaIdUpdate = f.pesquisa_id;
    if (pesquisa !== undefined) {
      pesquisaIntUpdate = pesquisa ? 1 : 0;
      pesquisaIdUpdate = pesquisaIntUpdate && pesquisa_id ? Number(pesquisa_id) : null;
    } else if (pesquisa_id !== undefined) {
      pesquisaIdUpdate = pesquisa_id || null;
    }

    await conn.query(
      `UPDATE filas SET display_name = ?, fila_timeout = ?, description = ?, gravacao = ?, ativo = ?, name = ?,
                        pesquisa = ?, pesquisa_id = ?
        WHERE name = ? AND tenant_id = ?`,
      [
        newDisplay,
        fila_timeout !== undefined ? Number(fila_timeout) : f.fila_timeout,
        description ?? f.description,
        gravacao === undefined ? f.gravacao : gravacao ? 1 : 0,
        ativo === undefined ? f.ativo : ativo ? 1 : 0,
        newName,
        pesquisaIntUpdate,
        pesquisaIdUpdate,
        oldName,
        String(tenant),
      ],
    );

    if (nameChanged) {
      await conn.query(`UPDATE queues SET name = ? WHERE tenant_id = ? AND name = ?`, [
        newName,
        String(tenant),
        oldName,
      ]);
      await conn.query(`UPDATE filas_agentes SET queue = ? WHERE tenant_id = ? AND queue = ?`, [
        newName,
        tenant,
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
      if (retry !== undefined) {
        sets.push("retry = ?");
        vals.push(Number(retry) || 0);
      }
      if (ringinuse !== undefined) {
        sets.push("ringinuse = ?");
        vals.push(ringinuse);
      }
      await conn.query(`UPDATE queues SET ${sets.join(", ")} WHERE tenant_id = ? AND name = ?`, [
        ...vals,
        String(tenant),
        newName,
      ]);
    }

    await conn.commit();

    if (nameChanged) {
      // descarrega a fila com o nome antigo (não existe mais na realtime source)...
      await amiQueueReloadParameters(oldName);
      // ...e carrega com o nome novo.
      await amiQueueReloadParameters(newName);
    } else {
      await amiQueueReloadParameters(newName);
    }

    res.json({ ok: true, name: newName });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.delete("/filas/:name", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const name = req.params.name;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM filas WHERE name = ? AND tenant_id = ?`, [
      name,
      String(tenant),
    ]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Fila não encontrada" });
    }
    const f = rows[0];
    const [rows1] = await coon.query(`SELECT tipo_destino, destino FROM roteamento WHERE destino = ? AND tenant_id = ?`, [name, String(tenant)]);
    if (rows1.length > 0) {
       await conn.rollback();
       return res.status(409).json({ error: "Fila selecionada em roteamento"  });
    }
    const [rows2] = await coon.query(`SELECT id FROM regra_horario WHERE (tipo_acao_dentro = 'FILA' AND acao_dentro = ? AND tenant_id = ?)) OR (tipo_acao_fora = 'FILA' AND acao_fora = ? AND tenant_id = ?)`, [name, String(tenant)]);
    if (rows1.length > 0) {
       await conn.rollback();
       return res.status(409).json({ error: "Fila selecionada em roteamento"  });
    }
    // Remove os agentes da fila ainda ativa no Asterisk (antes de apagar do
    // banco), para não deixar membros "fantasma" na memória.
    const [agentes] = await conn.query(
      `SELECT interface FROM filas_agentes WHERE tenant_id = ? AND queue = ?`,
      [tenant, name],
    );
    for (const a of agentes) {
      try {
        await amiCommand(`queue remove member ${a.interface} from ${f.name}`);
      } catch (e) {
        console.error(
          `[ami] remover agente ${a.interface} da fila ${f.name} falhou:`,
          e.message || e,
        );
      }
    }

    await conn.query(`DELETE FROM filas WHERE name = ? AND tenant_id = ?`, [name, String(tenant)]);

    await conn.commit();
    await amiQueueReloadParameters(name);
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.put("/filas/:name/ativo", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;

  const name = req.params.name;
  const { ativo } = req.body || {};

  if (typeof ativo !== "boolean") {
    return res.status(400).json({
      error: "O campo ativo deve ser booleano.",
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE filas
          SET ativo = ?
        WHERE name = ? AND tenant_id = ?`,
      [ativo ? 1 : 0, name, String(tenant)],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Fila não encontrada",
      });
    }

    if (ativo) {
      await restoreQueueMembers(name);
    } else {
      await queueRefresh(name);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
