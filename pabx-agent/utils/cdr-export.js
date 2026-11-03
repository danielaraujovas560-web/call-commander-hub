const ExcelJS = require("exceljs");
const pool = require("../config/db");
const { getTenant } = require("./tenant");
const { construirFiltros } = require("./cdr-query");

const TAMANHO_LOTE = 2000;
const MAX_DIAS = 31;
const MAX_LINHAS_PLANILHA = 1048576;

function validarData(valor) {
  if (typeof valor !== "string") return null;

  const texto = valor.trim();

  // Aceita YYYY-MM-DD ou YYYY-MM-DDTHH:mm[:ss]
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);

  if (!match) return null;

  const [, ano, mes, dia, hora = "00", minuto = "00", segundo = "00"] = match;

  const timestamp = Date.UTC(Number(ano), Number(mes) - 1, Number(dia));

  const data = new Date(timestamp);

  if (
    data.getUTCFullYear() !== Number(ano) ||
    data.getUTCMonth() !== Number(mes) - 1 ||
    data.getUTCDate() !== Number(dia) ||
    Number(hora) > 23 ||
    Number(minuto) > 59 ||
    Number(segundo) > 59
  ) {
    return null;
  }

  return {
    timestamp,
    data: texto,
    dia: `${ano}-${mes}-${dia}`,
    horario: `${hora}:${minuto}:${segundo}`,
  };
}

function validarPeriodo(query) {
  const inicio = validarData(query.from);
  const fim = validarData(query.to);

  if (!inicio || !fim) {
    return "Informe as datas inicial e final em formato válido.";
  }

  const inicioCompleto = `${inicio.dia} ${inicio.horario}`;
  const fimCompleto = `${fim.dia} ${fim.horario}`;

  if (inicioCompleto > fimCompleto) {
    return "A data inicial não pode ser posterior à data final.";
  }

  const dias = Math.round((fim.timestamp - inicio.timestamp) / 86400000) + 1;

  if (dias > MAX_DIAS) {
    return `O período máximo permitido é de ${MAX_DIAS} dias corridos.`;
  }

  return null;
}

function valorExcel(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  if (valor instanceof Date) {
    return valor;
  }

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : "";
  }

  const texto = String(valor);

  // Evita interpretação de conteúdo do banco como fórmula.
  if (/^[\s]*[=+\-@\t\r]/.test(texto)) {
    return "'" + texto;
  }

  return texto;
}

function cdrExportEndpoint(router, path, configs) {
  router.get(path, async (req, res) => {
    const tipo = req.params.tipo;

    const cfg = Object.prototype.hasOwnProperty.call(configs, tipo) ? configs[tipo] : null;

    if (!cfg) {
      return res.status(400).json({
        error: "Tipo de relatório inválido.",
      });
    }

    const tenant = getTenant(req, res);
    if (!tenant) return;

    const erroPeriodo = validarPeriodo(req.query);

    if (erroPeriodo) {
      return res.status(400).json({
        error: erroPeriodo,
      });
    }

    if (
      !cfg.select ||
      !(cfg.from || cfg.table) ||
      !cfg.order ||
      !Array.isArray(cfg.columns) ||
      cfg.columns.length === 0
    ) {
      console.error(`[CDR EXPORT] Configuração inválida: ${tipo}`);

      return res.status(500).json({
        error: "Configuração de exportação inválida.",
      });
    }

    const { where, vals } = construirFiltros(req.query, cfg, tenant);

    const from = cfg.from || cfg.table;

    // Desempate para datas iguais.
    // O relatório deve fornecer uma coluna ID única.
    const order = `${cfg.order} DESC, ${cfg.idCol || "c.id"} DESC`;

    const sql = `
      SELECT ${cfg.select}
      FROM ${from}
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `;

    let workbook = null;
    let worksheet = null;
    let numeroPlanilha = 0;
    let linhasPlanilha = 0;
    let totalExportado = 0;
    let offset = 0;

    let clienteDesconectado = false;

    res.on("close", () => {
      if (!res.writableFinished) {
        clienteDesconectado = true;
      }
    });

    function criarPlanilha() {
      numeroPlanilha++;

      const sheet = workbook.addWorksheet(
        numeroPlanilha === 1 ? "Relatório" : `Relatório ${numeroPlanilha}`,
      );

      sheet.columns = cfg.columns;

      sheet.getRow(1).font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };

      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };

      sheet.getRow(1).commit();

      linhasPlanilha = 1;

      return sheet;
    }

    try {
      // Consulta inicial antes de começar a resposta XLSX.
      // Assim, erros comuns de SQL ainda podem retornar JSON.
      let [rows] = await pool.query(sql, [...vals, TAMANHO_LOTE, offset]);

      const nomeArquivo =
        `cdr_${tipo}_${req.query.from.slice(0, 10)}` + `_a_${req.query.to.slice(0, 10)}.xlsx`;

      res.status(200);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: false,
      });

      worksheet = criarPlanilha();

      while (!clienteDesconectado) {
        for (const registro of rows) {
          if (clienteDesconectado) break;

          if (linhasPlanilha >= MAX_LINHAS_PLANILHA) {
            worksheet.commit();
            worksheet = criarPlanilha();
          }

          const linha = {};

          for (const coluna of cfg.columns) {
            linha[coluna.key] = valorExcel(registro[coluna.key]);
          }

          worksheet.addRow(linha).commit();

          linhasPlanilha++;
          totalExportado++;
        }

        if (clienteDesconectado || rows.length < TAMANHO_LOTE) {
          break;
        }

        offset += rows.length;

        [rows] = await pool.query(sql, [...vals, TAMANHO_LOTE, offset]);
      }

      if (clienteDesconectado) {
        console.warn(`[CDR EXPORT] Download interrompido: ${tipo}`);
        return;
      }

      worksheet.commit();
      await workbook.commit();

      console.log(
        `[CDR EXPORT] Tipo=${tipo} ` +
          `Tenant=${tenant} ` +
          `Registros=${totalExportado} ` +
          `Planilhas=${numeroPlanilha}`,
      );
    } catch (error) {
      console.error(`[CDR EXPORT] Erro ao exportar ${tipo}:`, error);

      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      return res.status(500).json({
        error: "Erro interno ao exportar relatório.",
      });
    }
  });
}

module.exports = cdrExportEndpoint;
