const ExcelJS = require("exceljs");
const pool = require("../config/db");
const { getTenant } = require("./tenant");
const { construirFiltros } = require("./cdr-query");
const { once } = require("node:events");

const TAMANHO_LOTE = 2000;
const MAX_DIAS = 31;
const MAX_LINHAS_PLANILHA = 1048576;
const jobs = new Map();
const JOB_TTL = 10 * 60 * 1000;

function validarData(valor) {
  if (typeof valor !== "string") return null;
  const match = valor
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, ano, mes, dia, hora = "00", minuto = "00", segundo = "00"] = match;
  const timestamp = Date.UTC(+ano, +mes - 1, +dia);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== +ano ||
    date.getUTCMonth() !== +mes - 1 ||
    date.getUTCDate() !== +dia ||
    +hora > 23 ||
    +minuto > 59 ||
    +segundo > 59
  )
    return null;
  return { timestamp, dia: `${ano}-${mes}-${dia}`, horario: `${hora}:${minuto}:${segundo}` };
}
function validarPeriodo(query) {
  const inicio = validarData(query.from),
    fim = validarData(query.to);
  if (!inicio || !fim) return "Informe as datas inicial e final em formato válido.";
  if (`${inicio.dia} ${inicio.horario}` > `${fim.dia} ${fim.horario}`)
    return "A data inicial não pode ser posterior à data final.";
  if ((fim.timestamp - inicio.timestamp) / 86400000 + 1 > MAX_DIAS)
    return `O período máximo permitido é de ${MAX_DIAS} dias corridos.`;
  return null;
}
function valorSeguro(valor) {
  if (valor == null) return "";
  if (valor instanceof Date) return valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : "";
  const text = String(valor);
  return /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
function csvCampo(valor) {
  const text = String(valorSeguro(valor)).replace(/\r\n?/g, "\n");
  return '"' + text.replace(/"/g, '""') + '"';
}
function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.updatedAt > JOB_TTL) jobs.delete(id);
}
function update(job, patch) {
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}
function cdrExportEndpoint(router, path, configs) {
  router.get("/cdr/exportar/progresso/:jobId", (req, res) => {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    cleanupJobs();
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.json({
        status: "preparing",
        processed: 0,
        total: 0,
      });
    }

    if (Number(job.tenant) !== Number(tenant)) {
      return res.status(404).json({
        error: "Exportação não encontrada",
      });
    }
    const { status, processed, total, error } = job;
    return res.json({ status, processed, total, ...(error ? { error } : {}) });
  });
  router.get(path, async (req, res) => {
    const tipo = req.params.tipo;
    const cfg = Object.prototype.hasOwnProperty.call(configs, tipo) ? configs[tipo] : null;
    if (!cfg) return res.status(400).json({ error: "Tipo de relatório inválido." });
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const erroPeriodo = validarPeriodo(req.query);
    if (erroPeriodo) return res.status(400).json({ error: erroPeriodo });
    const formato =
      req.query.formato === "csv"
        ? "csv"
        : req.query.formato == null || req.query.formato === "xlsx"
          ? "xlsx"
          : null;
    if (!formato) return res.status(400).json({ error: "Formato inválido" });
    if (
      !cfg.select ||
      !(cfg.from || cfg.table) ||
      !cfg.order ||
      !Array.isArray(cfg.columns) ||
      !cfg.columns.length
    )
      return res.status(500).json({ error: "Configuração de exportação inválida" });
    const jobId = String(req.query.jobId || "");
    if (jobId && !/^[0-9a-f-]{36}$/i.test(jobId))
      return res.status(400).json({ error: "jobId inválido" });
    cleanupJobs();
    if (jobId && jobs.has(jobId)) return res.status(409).json({ error: "Exportação já iniciada" });
    const job = jobId
      ? { tenant, status: "preparing", processed: 0, total: 0, updatedAt: Date.now() }
      : null;
    if (job) jobs.set(jobId, job);
    const { where, vals } = construirFiltros(req.query, cfg, tenant);
    const from = cfg.from || cfg.table;
    const order = `${cfg.order} DESC, ${cfg.idCol || "c.id"} DESC`;
    const sql = `SELECT ${cfg.select} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`;
    let disconnected = false;
    res.on("close", () => {
      if (!res.writableFinished) {
        disconnected = true;
        update(job, { status: "cancelled" });
      }
    });
    let workbook,
      worksheet,
      sheetNumber = 0,
      sheetRows = 0,
      processed = 0,
      offset = 0;
    function createSheet() {
      sheetNumber++;
      const sheet = workbook.addWorksheet(
        sheetNumber === 1 ? "Relatório" : `Relatório ${sheetNumber}`,
      );
      sheet.columns = cfg.columns;
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      sheet.getRow(1).commit();
      sheetRows = 1;
      return sheet;
    }
    try {
      const [counts] = await pool.query(countSql, vals);
      update(job, { total: Number(counts[0]?.total || 0) });
      let [rows] = await pool.query(sql, [...vals, TAMANHO_LOTE, offset]);
      const filename = `cdr_${tipo}_${req.query.from.slice(0, 10)}_a_${req.query.to.slice(0, 10)}.${formato}`;
      res.status(200).set({
        "Content-Type":
          formato === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (formato === "xlsx") {
        workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
          stream: res,
          useStyles: true,
          useSharedStrings: false,
        });
        worksheet = createSheet();
      } else {
        res.write("\uFEFF");
        res.write(cfg.columns.map((col) => csvCampo(col.header)).join(";") + "\r\n");
      }
      update(job, { status: "running" });
      while (!disconnected) {
        for (const record of rows) {
          if (disconnected) break;
          if (formato === "xlsx") {
            if (sheetRows >= MAX_LINHAS_PLANILHA) {
              worksheet.commit();
              worksheet = createSheet();
            }
            const data = {};
            for (const col of cfg.columns) data[col.key] = valorSeguro(record[col.key]);
            worksheet.addRow(data).commit();
            sheetRows++;
          } else {
            const line = cfg.columns.map((col) => csvCampo(record[col.key])).join(";") + "\r\n";
            if (!res.write(line)) await once(res, "drain");
          }
          processed++;
        }
        update(job, { processed });
        if (disconnected || rows.length < TAMANHO_LOTE) break;
        offset += rows.length;
        [rows] = await pool.query(sql, [...vals, TAMANHO_LOTE, offset]);
      }
      if (disconnected) return;
      if (formato === "xlsx") {
        worksheet.commit();
        await workbook.commit();
      } else res.end();
      update(job, { status: "done", processed });
      console.log(
        `[CDR EXPORT] Tipo=${tipo} Formato=${formato} Tenant=${tenant} Registros=${processed}`,
      );
    } catch (error) {
      console.error(`[CDR EXPORT] Erro ao exportar ${tipo}:`, error);
      update(job, { status: "error", error: "Erro ao gerar arquivo" });
      if (res.headersSent) return res.destroy(error);
      return res.status(500).json({ error: "Erro interno ao exportar relatório." });
    }
  });
}

module.exports = cdrExportEndpoint;
