const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function gerarTokenRamal(ramal) {
  return jwt.sign(
    {
      sub: String(ramal.endpoint_id),
      endpoint_id: String(ramal.endpoint_id),
      tenant_id: ramal.tenant_id,
      type: "ramal",
    },
    JWT_SECRET,
    {
      expiresIn: "8h",
    },
  );
}

module.exports = {
  gerarTokenRamal,
};
