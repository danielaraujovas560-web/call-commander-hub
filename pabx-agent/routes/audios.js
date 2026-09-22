const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { getTenant } = require("../utils/tenant");
const slugName = require("../utils/slug");

const {
  SOUNDS_BASE = "/var/lib/asterisk/sounds/",
  SOX_BIN = "sox",
} = process.env;

router.get("/audios", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const dir = path.join(SOUNDS_BASE, `t${tenant}`);
  try {
    const files = await fs.readdir(dir);
    const identifiers = files
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .map((f) => f.replace(/\.wav$/i, ""));

    if (!identifiers.length) return res.json({ audios: [], dir });

    const placeholders = identifiers.map(() => "?").join(",");

    console.log("ARQUIVOS:", identifiers);

    const [audios] = await pool.query(
      `SELECT * FROM audios WHERE tenant_id = ? AND audio_identifier IN (${placeholders}) ORDER BY created_at ASC`,
      [tenant, ...identifiers],
    );

    console.log("AUDIOS DO BANCO:", audios);

    res.json({ audios, dir });
  } catch (e) {
    if (e.code === "ENOENT") return res.json({ audios: [], dir, warn: "diretório inexistente" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/audios", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const { display_name, extensao, conteudo_base64 } = req.body || {};
  const ext = String(extensao || "")
    .toLowerCase()
    .replace(/^\./, "");

  if (typeof display_name !== "string" || !display_name.trim())
    return res.status(400).json({ error: "Nome do áudio é obrigatório" });
  if (!["wav", "mp3"].includes(ext))
    return res.status(400).json({ error: "Envie um arquivo WAV ou MP3." });
  if (typeof conteudo_base64 !== "string" || !conteudo_base64)
    return res.status(400).json({ error: "Arquivo obrigatório." });

  const slug = slugName(display_name.trim());
  const audioIdentifier = `a${tenant}-${slug}`;
  const dir = path.join(SOUNDS_BASE, `t${tenant}`);
  const finalPath = path.join(dir, `${audioIdentifier}.wav`);
  const token = randomBytes(12).toString("hex");
  const inputPath = path.join(dir, `.upload-${token}-in.${ext}`);
  const outputPath = path.join(dir, `.upload-${token}-out.wav`);

  let finalFileCreated = false;

  try {
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(finalPath);

      return res.status(409).json({
        error: "Já existe um áudio com esse identificador neste tenant.",
      });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    const content = Buffer.from(conteudo_base64, "base64");

    if (!content.length) return res.status(400).json({ error: "Arquivo vazio ou inválido." });

    await fs.writeFile(inputPath, content, { flag: "wx" });

    await execFileAsync(SOX_BIN, [
      inputPath,
      "-r",
      "8000",
      "-c",
      "1",
      "-b",
      "16",
      "-e",
      "signed-integer",
      outputPath,
    ]);

    // Evita sobrescrever outro upload concorrente.
    await fs.link(outputPath, finalPath);

    finalFileCreated = true;

    await pool.query(
      `INSERT INTO audios
        (audio_identifier, display_name, tenant_id)
       VALUES (?, ?, ?)`,
      [audioIdentifier, display_name.trim(), tenant],
    );

    res.status(201).json({
      ok: true,
      audio_identifier: audioIdentifier,
      display_name: display_name.trim(),
    });
  } catch (e) {
    if (finalFileCreated) await fs.rm(finalPath, { force: true }).catch(() => {});
    if (e.code === "EEXIST") {
      return res.status(409).json({
        error: "Já existe um áudio com esse identificador neste tenant.",
      });
    }

    res.status(500).json({
      error: `Não foi possível processar o áudio: ${String(e.message || e)}`,
    });
  } finally {
    await Promise.all([
      fs.rm(inputPath, { force: true }).catch(() => {}),
      fs.rm(outputPath, { force: true }).catch(() => {}),
    ]);
  }
});

router.put("/audios/:audio_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const audioIdentifier = req.params.audio_identifier;
  const { display_name } = req.body || {};

  if (!audioIdentifier)
    return res.status(400).json({ error: "Identificador do áudio não informado." });
  if (typeof display_name !== "string" || !display_name.trim())
    return res.status(400).json({ error: "Nome do áudio é obrigatório." });

  const cleanDisplayName = display_name.trim();

  try {
    const [result] = await pool.query(
      `UPDATE audios
       SET display_name = ?
       WHERE tenant_id = ?
         AND audio_identifier = ?`,
      [cleanDisplayName, tenant, audioIdentifier],
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: "Áudio não encontrado." });

    res.json({
      ok: true,
      audio_identifier: audioIdentifier,
      display_name: cleanDisplayName,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

router.delete("/audios/:audio_identifier", async (req, res) => {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const audioIdentifier = req.params.audio_identifier;
  if (!audioIdentifier) return res.status(400).json({ error: "Áudio não encontrado" });
  try {
    const [usos] = await pool.query(
      "SELECT ura_identifier, nome FROM uras WHERE tenant_id = ? AND audio = ? ORDER BY nome",
      [tenant, audioIdentifier],
    );
    if (usos.length) {
      return res.status(409).json({
        error: `Áudio em uso por ${usos.length} URA(s): ${usos.map((u) => u.nome).join(", ")}`,
      });
    }

    const finalPath = path.join(SOUNDS_BASE, `t${tenant}`, `${audioIdentifier}.wav`);
    await fs.unlink(finalPath);
    await pool.query(`DELETE FROM audios WHERE tenant_id = ? AND audio_identifier = ?`, [
      tenant,
      audioIdentifier,
    ]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "ENOENT") return res.status(404).json({ error: "Áudio não encontrado." });
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
