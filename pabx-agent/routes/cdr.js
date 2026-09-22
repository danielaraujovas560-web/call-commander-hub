const express = require("express");
const router = express.Router();
const cdrFilteredEndpoint = require("../utils/cdr-filtered");

cdrFilteredEndpoint(router, "/cdr/ramal", {
  select:
    "c.id, c.linkedid, c.context, c.tipo_chamada, c.origem, COALESCE(rd.nome, c.destino) AS destino, COALESCE(ro.nome, c.origem) AS agente, COALESCE(t.nome, c.tronco) AS tronco, c.status, c.nome_gravacao, c.duracao, c.date_time",
  from: `cdr_ramal c
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
    "c.id, c.linkedid, c.num_did, c.nome_ura, c.opcao, c.dest_op, COALESCE(r.nome, f.display_name, u2.nome, c.dest_nome) AS destino_nome, c.date_time",
  from: `cdr_ura c LEFT JOIN ramais r ON c.dest_op = 'RAMAL' AND r.tenant_id = c.tenant_id AND r.endpoint_id = c.dest_nome
  LEFT JOIN filas f ON c.dest_op = 'FILA' AND f.tenant_id = c.tenant_id AND f.name = c.dest_nome
  LEFT JOIN uras u2 ON c.dest_op = 'URA' AND u2.tenant_id = c.tenant_id AND u2.ura_identifier = c.dest_nome`,
  order: "c.date_time",
  dateCol: "c.date_time",
  tenantCol: "c.tenant_id",
  filters: { linkedid: "c.linkedid", origem: "c.num_did", destino: "c.opcao", status: "c.nome_ura" },
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
  tenantWhere: "(ps.tenant_id = ? OR ps.tenant_id IS NULL)",
  order: "p.data",
  dateCol: "p.data",
  exactFilters: ["p.tipo"],
  filters: {
    linkedid: "p.linkedid",
    origem:   "COALESCE(ro.nome, p.origem)",
    destino:  "COALESCE(rd.nome, p.destino)",
    status:   "COALESCE(f.display_name, p.fila)",
    tipo:     "p.tipo",
    contexto: "p.contexto",
  },
});
cdrFilteredEndpoint(router, "/cdr/cidades/entrada", {
  select:
    "cde.id, cde.linkedid, cde.ddd, cde.numero, cde.sigla_estado, cd.estado, cr.tipo_chamada, cr.status, cde.data_hora",
  from: `cdr_cidades_entrada cde LEFT JOIN cdr_ramal cr ON cde.linkedid = cr.linkedid AND cde.tenant_id = cr.tenant_id
         LEFT JOIN cidades_ddd cd ON cde.ddd = cd.ddd`,
  order: "cde.data_hora",
  dateCol: "cde.data_hora",
  rankCol: "cde.ddd",
  tenantCol: "cde.tenant_id",
  exactFilters: ["cde.status", "cde.sigla_estado"],
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
  from: `cdr_cidades_saida cds LEFT JOIN cdr_ramal cr ON cds.linkedid = cr.linkedid AND cds.tenant_id = cr.tenant_id
         LEFT JOIN cidades_ddd cd ON cds.ddd = cd.ddd`,
  order: "cds.data_hora",
  dateCol: "cds.data_hora",
  rankCol: "cds.ddd",
  tenantCol: "cds.tenant_id",
  exactFilters: ["cds.status", "cds.sigla_estado"],
  filters: {
    origem: "cds.numero",
    destino: "cds.numero",
    tipo: "cr.tipo_chamada",
    status: "cr.status",
    sigla_estado: "cds.sigla_estado",
  },
});

module.exports = router;
