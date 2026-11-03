const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const cdrFilteredEndpoint = require("../utils/cdr-filtered");
const cdrExportEndpoint = require("../utils/cdr-export");

cdrFilteredEndpoint(router, "/cdr/geral", {
  select:
    "c.id, c.linkedid, c.context, c.tipo_chamada, c.origem, COALESCE(rd.nome, c.destino) AS destino, COALESCE(ro.nome, c.origem) AS agente, COALESCE(t.nome, c.tronco) AS tronco, c.status, c.nome_gravacao, c.duracao, c.date_time",
  from: `cdr_geral c
         LEFT JOIN ramais ro ON ro.tenant_id = c.tenant_id AND ro.endpoint_id = c.origem
         LEFT JOIN ramais rd ON rd.tenant_id = c.tenant_id AND rd.endpoint_id = c.destino
         LEFT JOIN troncos t ON t.tronco_pjsip = c.tronco`,
  order: "c.date_time",
  dateCol: "c.date_time",
  tenantCol: "c.tenant_id",
  exactFilters: ["status"],
  filters: {
    linkedid: "c.linkedid",
    origem: "CONCAT(COALESCE(ro.nome, ''), ' ', c.origem)",
    destino: "CONCAT(COALESCE(rd.nome, ''), ' ', c.destino)",
    status: "c.status",
    tipo: "c.tipo_chamada",
  },
});
cdrFilteredEndpoint(router, "/cdr/fila", {
  select:
    "c.id, c.linkedid, c.fila, c.nome_fila AS display_name, COALESCE(r.nome, c.ramal) agente, c.evento, c.motivo, c.nome_gravacao, c.time_data",
  from: `cdr_fila c LEFT JOIN ramais r ON r.tenant_id = c.tenant_id AND r.endpoint_id = c.ramal`,
  order: "c.time_data",
  dateCol: "c.time_data",
  tenantCol: "c.tenant_id",
  exactFilters: ["status"],
  filters: {
    linkedid: "linkedid",
    origem: "CONCAT(COALESCE(r.nome, ''), ' ', c.ramal)",
    destino: "ramal",
    status: "evento",
  },
});
cdrFilteredEndpoint(router, "/cdr/ura", {
  select:
    "c.id, c.linkedid, c.num_did, c.id_ura, c.nome_ura, c.tipo, c.opcao, c.dest_op, COALESCE(r.nome, f.display_name, u2.nome, c.dest_nome) AS destino_nome, c.custo_ia_brl, c.date_time",
  from: `cdr_ura c LEFT JOIN ramais r ON c.dest_op = 'RAMAL' AND r.tenant_id = c.tenant_id AND r.endpoint_id = c.dest_nome
  LEFT JOIN filas f ON c.dest_op = 'FILA' AND f.tenant_id = c.tenant_id AND f.name = c.dest_nome
  LEFT JOIN uras u2 ON c.dest_op = 'URA' AND u2.tenant_id = c.tenant_id AND u2.ura_identifier = c.dest_nome`,
  order: "c.date_time",
  dateCol: "c.date_time",
  tenantCol: "c.tenant_id",
  filters: {
    linkedid: "c.linkedid",
    origem: "c.num_did",
    destino: "c.opcao",
    status: "c.nome_ura",
    tipo: "c.tipo",
  },
});
cdrFilteredEndpoint(router, "/cdr/pesquisa", {
  select: `p.id, p.linkedid, p.tipo, p.contexto,
           COALESCE(ro.nome, p.origem) AS origem,
           COALESCE(rd.nome, p.destino) AS destino,
           p.nome_fila AS fila,
           p.pergunta_id, p.nota, p.data`,
  from: `cdr_pesquisa p
         LEFT JOIN pesquisa_satisfacao ps ON ps.id = p.pesquisa_id
         LEFT JOIN ramais ro ON ro.endpoint_id = p.origem
         LEFT JOIN ramais rd ON rd.endpoint_id = p.destino`,
  order: "p.data",
  dateCol: "p.data",
  tenantCol: "ps.tenant_id",
  exactFilters: ["tipo"],
  filters: {
    linkedid: "p.linkedid",
    origem: "COALESCE(ro.nome, p.origem)",
    destino: "COALESCE(rd.nome, p.destino)",
    status: "COALESCE(f.display_name, p.fila)",
    tipo: "p.tipo",
    contexto: "p.contexto",
  },
});
cdrFilteredEndpoint(router, "/cdr/cidades/entrada", {
  select:
    "cde.id, cde.linkedid, cde.ddd, cde.numero, cde.sigla_estado, cd.estado, cr.tipo_chamada, cr.status, cde.data_hora",
  from: `cdr_cidades_entrada cde LEFT JOIN cdr_geral cr ON cde.linkedid = cr.linkedid AND cde.tenant_id = cr.tenant_id
         LEFT JOIN cidades_ddd cd ON cde.ddd = cd.ddd`,
  order: "cde.data_hora",
  dateCol: "cde.data_hora",
  rankCol: "cde.ddd",
  tenantCol: "cde.tenant_id",
  exactFilters: ["status", "sigla_estado"],
  filters: {
    origem: "cde.numero",
    destino: "cde.numero",
    tipo: "cr.tipo_chamada",
    status: "cr.status",
    sigla_estado: "cde.sigla_estado",
  },
});
cdrFilteredEndpoint(router, "/cdr/cidades/saida", {
  select:
    "cds.id, cds.linkedid, cds.ddd, cds.numero, cds.sigla_estado, cd.estado, cr.tipo_chamada, cr.status, cds.data_hora",
  from: `cdr_cidades_saida cds LEFT JOIN cdr_geral cr ON cds.linkedid = cr.linkedid AND cds.tenant_id = cr.tenant_id
         LEFT JOIN cidades_ddd cd ON cds.ddd = cd.ddd`,
  order: "cds.data_hora",
  dateCol: "cds.data_hora",
  rankCol: "cds.ddd",
  tenantCol: "cds.tenant_id",
  exactFilters: ["status", "sigla_estado"],
  filters: {
    origem: "cds.numero",
    destino: "cds.numero",
    tipo: "cr.tipo_chamada",
    status: "cr.status",
    sigla_estado: "cds.sigla_estado",
  },
});

// Exportação
cdrExportEndpoint(router, "/cdr/exportar/:tipo", {
  geral: {
    select:
      "c.id, c.linkedid, c.context, c.tipo_chamada, c.origem, COALESCE(rd.nome, c.destino) AS destino, COALESCE(ro.nome, c.origem) AS agente, COALESCE(t.nome, c.tronco) AS tronco, c.status, c.nome_gravacao, c.duracao, c.date_time",
    from: `cdr_geral c
      LEFT JOIN ramais ro ON ro.tenant_id = c.tenant_id AND ro.endpoint_id = c.origem
      LEFT JOIN ramais rd ON rd.tenant_id = c.tenant_id AND rd.endpoint_id = c.destino
      LEFT JOIN troncos t ON t.tronco_pjsip = c.tronco`,
    order: "c.date_time",
    idCol: "c.id",
    dateCol: "c.date_time",
    tenantCol: "c.tenant_id",
    exactFilters: ["status"],
    filters: {
      linkedid: "c.linkedid",
      origem: "CONCAT(COALESCE(ro.nome, ''), ' ', c.origem)",
      destino: "CONCAT(COALESCE(rd.nome, ''), ' ', c.destino)",
      status: "c.status",
      tipo: "c.tipo_chamada",
      contexto: "c.context",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "Origem", key: "agente", width: 20 },
      { header: "Destino", key: "destino", width: 20 },
      { header: "Tronco", key: "tronco", width: 20 },
      { header: "Contexto", key: "context", width: 20 },
      { header: "Tipo", key: "tipo_chamada", width: 20 },
      { header: "Duração (seg)", key: "duracao", width: 18 },
      { header: "Status", key: "status", width: 18 },
      { header: "Data/Hora", key: "date_time", width: 22 },
    ],
  },
  fila: {
    select:
      "c.id, c.linkedid, c.fila, c.nome_fila AS display_name, COALESCE(r.nome, c.ramal) AS agente, c.ramal, c.evento, c.motivo, c.nome_gravacao, c.time_data",
    from: `cdr_fila c
      LEFT JOIN ramais r ON r.tenant_id = c.tenant_id AND r.endpoint_id = c.ramal`,
    order: "c.time_data",
    idCol: "c.id",
    dateCol: "c.time_data",
    tenantCol: "c.tenant_id",
    exactFilters: ["status"],
    filters: {
      linkedid: "c.linkedid",
      origem: "CONCAT(COALESCE(r.nome, ''), ' ', c.ramal)",
      destino: "c.ramal",
      status: "c.evento",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "Fila", key: "fila", width: 20 },
      { header: "Nome da fila", key: "display_name", width: 24 },
      { header: "Agente", key: "agente", width: 24 },
      { header: "Ramal", key: "ramal", width: 16 },
      { header: "Evento", key: "evento", width: 22 },
      { header: "Motivo", key: "motivo", width: 24 },
      { header: "Gravação", key: "nome_gravacao", width: 30 },
      { header: "Data/Hora", key: "time_data", width: 22 },
    ],
  },
  ura: {
    select:
      "c.id, c.linkedid, c.num_did, c.id_ura, c.nome_ura, c.tipo, c.opcao, c.dest_op, COALESCE(r.nome, f.display_name, u2.nome, c.dest_nome) AS destino_nome, c.custo_ia_brl, c.date_time",
    from: `cdr_ura c
      LEFT JOIN ramais r ON c.dest_op = 'RAMAL' AND r.tenant_id = c.tenant_id AND r.endpoint_id = c.dest_nome
      LEFT JOIN filas f ON c.dest_op = 'FILA' AND f.tenant_id = c.tenant_id AND f.name = c.dest_nome
      LEFT JOIN uras u2 ON c.dest_op = 'URA' AND u2.tenant_id = c.tenant_id AND u2.ura_identifier = c.dest_nome`,
    order: "c.date_time",
    idCol: "c.id",
    dateCol: "c.date_time",
    tenantCol: "c.tenant_id",
    filters: {
      linkedid: "c.linkedid",
      origem: "c.num_did",
      destino: "c.opcao",
      status: "c.nome_ura",
      tipo: "c.tipo",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "Número DID", key: "num_did", width: 20 },
      { header: "ID URA", key: "id_ura", width: 18 },
      { header: "Nome URA", key: "nome_ura", width: 24 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Opção", key: "opcao", width: 16 },
      { header: "Destino (tipo)", key: "dest_op", width: 18 },
      { header: "Destino", key: "destino_nome", width: 24 },
      { header: "Custo IA (R$)", key: "custo_ia_brl", width: 18 },
      { header: "Data/Hora", key: "date_time", width: 22 },
    ],
  },
  pesquisa: {
    select: `p.id, p.linkedid, p.tipo, p.contexto,
      COALESCE(ro.nome, p.origem) AS origem,
      COALESCE(rd.nome, p.destino) AS destino,
      p.nome_fila AS fila, p.pergunta_id, p.nota, p.data`,
    from: `cdr_pesquisa p
      LEFT JOIN pesquisa_satisfacao ps ON ps.id = p.pesquisa_id
      LEFT JOIN ramais ro ON ro.tenant_id = ps.tenant_id AND ro.endpoint_id = p.origem
      LEFT JOIN ramais rd ON rd.tenant_id = ps.tenant_id AND rd.endpoint_id = p.destino`,
    tenantCol: "ps.tenant_id",
    order: "p.data",
    idCol: "p.id",
    dateCol: "p.data",
    exactFilters: ["tipo"],
    filters: {
      linkedid: "p.linkedid",
      origem: "COALESCE(ro.nome, p.origem)",
      destino: "COALESCE(rd.nome, p.destino)",
      status: "p.nome_fila",
      tipo: "p.tipo",
      contexto: "p.contexto",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Contexto", key: "contexto", width: 20 },
      { header: "Origem", key: "origem", width: 24 },
      { header: "Destino", key: "destino", width: 24 },
      { header: "Fila", key: "fila", width: 24 },
      { header: "Pergunta ID", key: "pergunta_id", width: 18 },
      { header: "Nota", key: "nota", width: 14 },
      { header: "Data/Hora", key: "data", width: 22 },
    ],
  },
  "cidades-entrada": {
    select:
      "cde.id, cde.linkedid, cde.ddd, cde.numero, cde.sigla_estado, cd.estado, cr.tipo_chamada, cr.status, cde.data_hora",
    from: `cdr_cidades_entrada cde
      LEFT JOIN cdr_geral cr ON cde.linkedid = cr.linkedid AND cde.tenant_id = cr.tenant_id
      LEFT JOIN cidades_ddd cd ON cde.ddd = cd.ddd`,
    order: "cde.data_hora",
    idCol: "cde.id",
    dateCol: "cde.data_hora",
    tenantCol: "cde.tenant_id",
    exactFilters: ["status", "sigla_estado"],
    filters: {
      origem: "cde.numero",
      destino: "cde.numero",
      tipo: "cr.tipo_chamada",
      status: "cr.status",
      sigla_estado: "cde.sigla_estado",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "DDD", key: "ddd", width: 12 },
      { header: "Número", key: "numero", width: 22 },
      { header: "UF", key: "sigla_estado", width: 10 },
      { header: "Estado", key: "estado", width: 24 },
      { header: "Tipo", key: "tipo_chamada", width: 20 },
      { header: "Status", key: "status", width: 18 },
      { header: "Data/Hora", key: "data_hora", width: 22 },
    ],
  },
  "cidades-saida": {
    select:
      "cds.id, cds.linkedid, cds.ddd, cds.numero, cds.sigla_estado, cd.estado, cr.tipo_chamada, cr.status, cds.data_hora",
    from: `cdr_cidades_saida cds
      LEFT JOIN cdr_geral cr ON cds.linkedid = cr.linkedid AND cds.tenant_id = cr.tenant_id
      LEFT JOIN cidades_ddd cd ON cds.ddd = cd.ddd`,
    order: "cds.data_hora",
    idCol: "cds.id",
    dateCol: "cds.data_hora",
    tenantCol: "cds.tenant_id",
    exactFilters: ["status", "sigla_estado"],
    filters: {
      origem: "cds.numero",
      destino: "cds.numero",
      tipo: "cr.tipo_chamada",
      status: "cr.status",
      sigla_estado: "cds.sigla_estado",
    },
    columns: [
      { header: "Linked ID", key: "linkedid", width: 25 },
      { header: "DDD", key: "ddd", width: 12 },
      { header: "Número", key: "numero", width: 22 },
      { header: "UF", key: "sigla_estado", width: 10 },
      { header: "Estado", key: "estado", width: 24 },
      { header: "Tipo", key: "tipo_chamada", width: 20 },
      { header: "Status", key: "status", width: 18 },
      { header: "Data/Hora", key: "data_hora", width: 22 },
    ],
  },
});

router.get("/cdr/ura/:id/extrato-ia", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(400).json({ error: "Tenant ID obrigatório" });

  const cdrId = Number(req.params.id);

  if (!Number.isSafeInteger(cdrId) || cdrId <= 0) {
    return res.status(400).json({
      error: "ID do CDR inválido",
    });
  }

  try {
    // 1. Busca o registro principal do CDR
    const [cdrRows] = await pool.query(
      `SELECT
         c.id,
         c.linkedid,
         c.id_ura,
         c.nome_ura,
         c.tipo,
         c.custo_ia_brl,
         c.date_time
       FROM cdr_ura c
       WHERE c.tenant_id = ?
         AND c.id = ?
       LIMIT 1`,
      [tenant, cdrId],
    );

    if (cdrRows.length === 0) {
      return res.status(404).json({
        error: "Registro do CDR não encontrado",
      });
    }

    const cdr = cdrRows[0];

    // 2. Busca os eventos de consumo relacionados à chamada e à URA
    const [eventos] = await pool.query(
      `SELECT
         e.id AS evento_id,
         e.componente,
         e.provedor,
         e.modelo,
         e.request_id,
         e.tokens_entrada,
         e.tokens_saida,
         e.caracteres_cobrados,
         e.custo_usd,
         e.custo_brl,
         e.status,
         e.criado_em
       FROM ia_consumo_eventos e
       WHERE e.tenant_id = ?
         AND e.linkedid = ?
         AND e.ura_identifier = ?
       ORDER BY e.criado_em ASC, e.id ASC`,
      [tenant, cdr.linkedid, cdr.id_ura],
    );

    return res.json({
      cdr: {
        id: cdr.id,
        linkedid: cdr.linkedid,
        id_ura: cdr.id_ura,
        nome_ura: cdr.nome_ura,
        tipo: cdr.tipo,
        custo_ia_brl: cdr.custo_ia_brl,
        date_time: cdr.date_time,
      },
      eventos,
      total_eventos: eventos.length,
    });
  } catch (error) {
    console.error("[CDR IA] Erro ao consultar extrato:", error);

    return res.status(500).json({
      error: "Erro interno ao consultar extrato de IA",
    });
  }
});

module.exports = router;
