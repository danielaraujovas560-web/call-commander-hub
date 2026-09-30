const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { randomBytes } = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const {
  SOUNDS_BASE = "/var/lib/asterisk/sounds/",
  MOH_BASE = "/var/lib/asterisk/moh",
  FFMPEG_BIN = "ffmpeg",
  FFPROBE_BIN = "ffprobe",
} = process.env;

// Helper para checar se o WAV já atende os requisitos do PABX
async function isAlreadyPabxWav(filePath) {
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=sample_rate,channels,codec_name",
      "-of", "json",
      filePath,
    ]);
    const info = JSON.parse(stdout);
    const stream = info.streams && info.streams[0];
    if (!stream) return false;

    return (
      String(stream.sample_rate) === "8000" &&
      Number(stream.channels) === 1 &&
      stream.codec_name === "pcm_s16le"
    );
  } catch {
    return false;
  }
}

router.get("/audios", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(401).json({ error: "Tenant não identificado." });

  const { tipo } = req.query;
  try {
    let query = "SELECT * FROM audios WHERE tenant_id = ?";
    const params = [tenant];

    if (tipo && ["normal", "musica_espera"].includes(tipo)) {
      query += " AND tipo = ?";
      params.push(tipo);
    }
    query += " ORDER BY created_at ASC";

    const [audios] = await pool.query(query, params);
    const audiosComStatus = await Promise.all(
      audios.map(async (audio) => {
        let filePath;

        if (audio.tipo === "normal") {
          filePath = path.join(SOUNDS_BASE, `t${tenant}`, `${audio.audio_identifier}.wav`);
        } else {
          // Para MOH, usamos a coluna fixa moh_name (ou o próprio audio_identifier como nome de pasta)
          filePath = path.join(MOH_BASE, `t${tenant}`, audio.moh_name, `${audio.audio_identifier}.wav`);
        }

        let existeNoDisco = false;
        try {
          await fs.access(filePath);
          existeNoDisco = true;
        } catch {
          existeNoDisco = false;
        }

        return {
          ...audio,
          existe_no_disco: existeNoDisco,
        };
      })
    );
    const audiosValidos = audiosComStatus.filter((a) => a.existe_no_disco);

    return res.json({ audios: audiosValidos });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/audios/:tipo", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(401).json({ error: "Tenant não identificado." });

  const { tipo } = req.params;
  if (!["normal", "musica_espera"].includes(tipo)) {
    return res.status(400).json({ error: "Tipo de áudio inválido. Use 'normal' ou 'musica_espera'." });
  }

  const { display_name, extensao, conteudo_base64 } = req.body || {};
  const ext = String(extensao || "")
    .toLowerCase()
    .replace(/^\./, "");

  if (typeof display_name !== "string" || !display_name.trim())
    return res.status(400).json({ error: "Nome do áudio é obrigatório." });
  if (!["wav", "mp3"].includes(ext))
    return res.status(400).json({ error: "Envie um arquivo WAV ou MP3." });
  if (typeof conteudo_base64 !== "string" || !conteudo_base64)
    return res.status(400).json({ error: "Arquivo obrigatório." });

  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, "0");
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const ano = String(agora.getFullYear()).slice(-2);
  const hora = String(agora.getHours()).padStart(2, "0");
  const minuto = String(agora.getMinutes()).padStart(2, "0");

  const audioIdentifier = `alterado-${dia}-${mes}-${ano}-${hora}-${minuto}`;

  // Agora a pasta MOH segue o mesmo padrão que o áudio
  const mohName = tipo === "musica_espera" ? `m${tenant}-${audioIdentifier}` : null;

  let dir;
  if (tipo === "normal") {
    dir = path.join(SOUNDS_BASE, `t${tenant}`);
  } else {
    dir = path.join(MOH_BASE, `t${tenant}`, mohName);
  }

  const finalPath = path.join(dir, `a${tenant}-${audioIdentifier}.wav`);
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

    // Verifica se precisa rodar o FFmpeg
    let needsConversion = true;
    if (ext === "wav") {
      needsConversion = !(await isAlreadyPabxWav(inputPath));
    }

    if (needsConversion) {
      await execFileAsync(FFMPEG_BIN, [
        "-y",
        "-i", inputPath,
        "-ar", "8000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        "-af", "highpass=f=200,lowpass=f=3400",
        outputPath,
      ]);
      await fs.link(outputPath, finalPath);
    } else {
      await fs.link(inputPath, finalPath);
    }

    finalFileCreated = true;

    // Grava na tabela audios (com moh_name)
    await pool.query(
      `INSERT INTO audios (audio_identifier, display_name, tipo, moh_name, tenant_id) VALUES (?, ?, ?, ?, ?)`,
      [audioIdentifier, display_name.trim(), tipo, mohName, tenant]
    );

    // Se for música de espera, registra no musiconhold
    if (tipo === "musica_espera") {
      await pool.query(
        `INSERT INTO musiconhold (tenant_id, name, directory) VALUES (?, ?, ?)`,
        [tenant, mohName, `t${tenant}/${mohName}`]
      );
    }

    res.status(201).json({
      ok: true,
      audio_identifier: audioIdentifier,
      display_name: display_name.trim(),
      moh_name: mohName,
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
  const tenant = req.tenantId;
  if (!tenant) return res.status(401).json({ error: "Tenant não identificado." });

  const audioIdentifier = req.params.audio_identifier;
  const { display_name } = req.body || {};

  if (!audioIdentifier)
    return res.status(400).json({ error: "Identificador do áudio não informado." });
  if (typeof display_name !== "string" || !display_name.trim())
    return res.status(400).json({ error: "Nome do áudio é obrigatório." });

  const cleanDisplayName = display_name.trim();

  try {
    // Como a pasta e identificadores são imutáveis, apenas atualizamos o display_name!
    const [result] = await pool.query(
      `UPDATE audios SET display_name = ? WHERE tenant_id = ? AND audio_identifier = ?`,
      [cleanDisplayName, tenant, audioIdentifier]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: "Áudio não encontrado." });

    res.json({
      ok: true,
      audio_identifier: audioIdentifier,
      display_name: cleanDisplayName,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// -----------------------------------------------------------------------------
// DELETE /audios/:audio_identifier
// -----------------------------------------------------------------------------
router.delete("/audios/:audio_identifier", async (req, res) => {
  const tenant = req.tenantId;
  if (!tenant) return res.status(401).json({ error: "Tenant não identificado." });

  const audioIdentifier = req.params.audio_identifier;
  if (!audioIdentifier) return res.status(400).json({ error: "Áudio não encontrado." });

  try {
    // 1. Verifica se está em uso por URAs
    const [usos] = await pool.query(
      "SELECT ura_identifier, nome FROM uras WHERE tenant_id = ? AND audio = ? ORDER BY nome",
      [tenant, audioIdentifier]
    );
    if (usos.length) {
      return res.status(409).json({
        error: `Áudio em uso por ${usos.length} URA(s): ${usos.map((u) => u.nome).join(", ")}`,
      });
    }

    // 2. Busca informações do áudio antes de apagar
    const [[audio]] = await pool.query(
      "SELECT * FROM audios WHERE tenant_id = ? AND audio_identifier = ?",
      [tenant, audioIdentifier]
    );

    if (!audio) return res.status(404).json({ error: "Áudio não encontrado." });

    // 3. Remove o arquivo e a pasta do disco
    if (audio.tipo === "normal") {
      const finalPath = path.join(SOUNDS_BASE, `t${tenant}`, `${audioIdentifier}.wav`);
      await fs.unlink(finalPath).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    } else if (audio.tipo === "musica_espera") {
      const mohDir = path.join(MOH_BASE, `t${tenant}`, audio.moh_name);

      // Deleta a pasta inteira do MOH no disco
      await fs.rm(mohDir, { recursive: true, force: true }).catch(() => {});

      // Deleta o registro correspondente da tabela musiconhold
      if (audio.moh_name) {
        await pool.query("DELETE FROM musiconhold WHERE tenant_id = ? AND name = ?", [
          tenant,
          audio.moh_name,
        ]);
      }
    }

    // 4. Remove o registro da tabela audios
    await pool.query("DELETE FROM audios WHERE tenant_id = ? AND audio_identifier = ?", [
      tenant,
      audioIdentifier,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
