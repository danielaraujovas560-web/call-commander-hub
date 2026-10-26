const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function obterChave() {
  const chaveHex = process.env.WHATSAPP_ENCRYPTION_KEY;

  if (typeof chaveHex !== "string" || !/^[a-fA-F0-9]{64}$/.test(chaveHex)) {
    throw new Error("[WHATSAPP-CRYPTO] WHATSAPP_ENCRYPTION_KEY inválida");
  }

  return Buffer.from(chaveHex, "hex");
}

function criptografarCredenciais(credenciais) {
  if (!credenciais || typeof credenciais !== "object" || Array.isArray(credenciais)) {
    throw new Error("[WHATSAPP-CRYPTO] Credenciais devem ser um objeto");
  }

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, obterChave(), iv);

  const texto = JSON.stringify(credenciais);

  const criptografado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);

  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    criptografado.toString("base64"),
  ].join(":");
}

function descriptografarCredenciais(valor) {
  if (typeof valor !== "string") {
    throw new Error("[WHATSAPP-CRYPTO] Credenciais inválidas");
  }

  const partes = valor.split(":");

  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error("[WHATSAPP-CRYPTO] Formato criptografado inválido");
  }

  const [, ivBase64, tagBase64, dadosBase64] = partes;

  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const dados = Buffer.from(dadosBase64, "base64");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || dados.length === 0) {
    throw new Error("[WHATSAPP-CRYPTO] Estrutura criptografada inválida");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, obterChave(), iv);

  decipher.setAuthTag(tag);

  const descriptografado = Buffer.concat([decipher.update(dados), decipher.final()]);

  const credenciais = JSON.parse(descriptografado.toString("utf8"));

  if (!credenciais || typeof credenciais !== "object" || Array.isArray(credenciais)) {
    throw new Error("[WHATSAPP-CRYPTO] Conteúdo descriptografado inválido");
  }

  return credenciais;
}

module.exports = {
  criptografarCredenciais,
  descriptografarCredenciais,
};
