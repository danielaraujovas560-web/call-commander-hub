const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: "10.1", db: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e.message || e) });
  }
});

module.exports = router;
