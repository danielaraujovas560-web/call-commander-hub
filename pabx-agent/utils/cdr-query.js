function normalizarData(valor, fimDoPeriodo = false) {
  let data = String(valor).replace("T", " ").trim();

  if (data.length === 10) {
    data += fimDoPeriodo ? " 23:59:59" : " 00:00:00";
  } else if (data.length === 16) {
    data += fimDoPeriodo ? ":59" : ":00";
  }

  return data;
}

function construirFiltros(query, cfg, tenant) {
  const exactFilters = new Set(cfg.exactFilters || []);

  const where = [cfg.tenantWhere || `${cfg.tenantCol || "tenant_id"} = ?`];

  const vals = [tenant];

  for (const [key, col] of Object.entries(cfg.filters || {})) {
    const valor = query[key];

    if (valor === undefined || valor === null || String(valor).trim() === "") {
      continue;
    }

    const texto = String(valor).trim();

    if (exactFilters.has(key)) {
      where.push(`${col} = ?`);
      vals.push(texto);
    } else {
      where.push(`${col} LIKE ?`);
      vals.push(`%${texto}%`);
    }
  }

  if (cfg.dateCol) {
    if (query.from) {
      where.push(`${cfg.dateCol} >= ?`);
      vals.push(normalizarData(query.from));
    }

    if (query.to) {
      where.push(`${cfg.dateCol} <= ?`);
      vals.push(normalizarData(query.to, true));
    }
  }

  return {
    where: where.join(" AND "),
    vals,
  };
}

module.exports = { construirFiltros };
