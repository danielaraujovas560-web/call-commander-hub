const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const authMiddleware = require("../middleware/auth-middle");

const {
  GRAVACAO_BASE = "/var/spool/asterisk/monitor/",
} = process.env;

router.get("/gravacoes/:tipo/:linkedid", authMiddleware, async (req, res) => {
  try {
    // Pega o tenant_id injetado pelo authMiddleware
    const tenant = req.tenantId;
    const chamadaId = req.params.linkedid;
    const tipo = req.params.tipo;

    if (!tenant) {
      return res.status(401).json({ error: "Tenant não identificado" });
    }

    // Valida o tipo para evitar manipulação de caminhos injetados (Directory Traversal)
    if (tipo !== "ramal" && tipo !== "fila") {
      return res.status(400).json({ error: "Tipo de gravação inválido" });
    }

    const tabela = tipo === "fila" ? "cdr_fila" : "cdr_ramal";

    //Faz a consulta usando o pool.query no padrão exato do seu arquivo
    const sql = `SELECT nome_gravacao FROM ${tabela} WHERE linkedid = ? AND tenant_id = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [chamadaId, tenant]);

    const chamada = rows[0];

    if (!chamada || !chamada.nome_gravacao) {
      return res.status(404).json({ erro: "Registro de gravação não encontrado no banco" });
    }

    // Extrai apenas o arquivo final de forma segura (ex: arquivo.wav)
    const arquivo = `${path.basename(chamada.nome_gravacao)}.wav`;
    // Monta o caminho completo no disco do Asterisk
    const caminho = path.join(GRAVACAO_BASE, tipo, `t${tenant}`, arquivo);

    // 4. Verifica se o arquivo existe e faz o stream dele
    await fs.access(caminho);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${arquivo}"`);
    res.setHeader("Content-Type", "audio/wav");
    fsSync.createReadStream(caminho).pipe(res);
  } catch (err) {
    console.error("[Erro Gravacao]:", err);
    res.status(404).json({ erro: "Gravação não encontrada no sistema" });
  }
});

module.exports = router;
