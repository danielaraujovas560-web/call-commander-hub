const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { JWT_SECRET, WSS_URL, SIP_PORT } = process.env;

router.get("/ws/ramais/token", async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const ticket = jwt.sign(
      {
        sub: req.userId,
        role: req.role,
        tenant_id: tenantId,
        type: "ramal_ws",
      },
      JWT_SECRET,
      { expiresIn: "60s" },
    );

    res.json({ ticket });
  } catch (e) {
    res.status(500).json({
      error: String(e.message || e),
    });
  }
});

module.exports = router;
