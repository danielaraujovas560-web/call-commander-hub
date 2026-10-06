const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/admin");

router.get("/config-geral", requireAdmin, async (req, res) => {
 try {
    const { chaves } = req.query;

// Consulta geral
    if (!chaves) {
      const [rows] = await pool.query(`
        SELECT id, chave, valor, tipo, descricao
        FROM config_geral
        ORDER BY id
      `);
      return res.json(rows);
    }

// Consulta específica
    const lista = String(chaves)
      .split(",")
      .map((chave) => chave.trim())
      .filter(Boolean);

    if (!lista.length) {
      return res.json([]);
    }
    const placeholders = lista.map(() => "?").join(",");
    const [rows] = await pool.query(`SELECT id, chave, valor, tipo, descricao FROM config_geral WHERE chave IN (${placeholders}) ORDER BY id`, lista);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/config-geral/:chave", requireAdmin, async (req, res) => {
  const chave = req.params.chave;
  const valor = String(req.body.valor);
  try {
    await pool.query(`UPDATE config_geral SET valor = ? WHERE chave = ?`, [valor, chave]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
