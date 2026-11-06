const fs = require("node:fs");
const {
  initializeApp,
  cert,
  getApps
} = require("firebase-admin/app");

const { getMessaging } = require("firebase-admin/messaging");

const MARCAS = new Set(["invertus", "alpha"]);

function iniciarFirebase(brand = "invertus") {
  brand = String(brand).trim().toLowerCase();

  if (!MARCAS.has(brand)) {
    throw new Error(`Marca Firebase inválida: ${brand}`);
  }

  // Ex.: FIREBASE_ALPHA_APPLICATION
  const variavel = `FIREBASE_${brand.toUpperCase()}_APPLICATION`;
  const caminho = process.env[variavel];

  if (!caminho) {
    throw new Error(`Variável não configurada: ${variavel}`);
  }

  // Invertus continua como aplicação padrão.
  const nomeApp = brand === "invertus"
    ? "[DEFAULT]"
    : brand;

  const existente = getApps().find(
    app => app.name === nomeApp
  );

  if (existente) {
    return getMessaging(existente);
  }

  const json = JSON.parse(
    fs.readFileSync(caminho, "utf8")
  );

  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error(`Credencial Firebase incompleta: ${brand}`);
  }

  const options = {
    credential: cert(json),
    projectId: json.project_id
  };

  const app = brand === "invertus"
    ? initializeApp(options)
    : initializeApp(options, brand);

  console.log("[FCM] Projeto inicializado:", {
    brand,
    projectId: json.project_id
  });

  return getMessaging(app);
}

async function enviarPushTeste(token, brand = "invertus") {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token FCM não informado");
  }

  const messaging = iniciarFirebase(brand);

  const messageId = await messaging.send({
    token: token.trim(),
    data: {
      type: "test",
      source: brand
    },
    android: {
      priority: "high",
      ttl: 30000
    }
  });

  console.log("[FCM] Mensagem enviada:", {
    brand,
    messageId
  });

  return messageId;
}

module.exports = {
  iniciarFirebase,
  enviarPushTeste
};
