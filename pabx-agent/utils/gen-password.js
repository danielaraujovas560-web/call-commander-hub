const { randomInt } = require("crypto");

function genPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[randomInt(0, chars.length)];
  return out;
}

module.exports = genPassword;
