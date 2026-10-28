const {
  initializeApp,
  applicationDefault,
  getApps
} = require("firebase-admin/app");

const { getMessaging } = require("firebase-admin/messaging");

function iniciarFirebase() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT
    });
  }

  return getMessaging();
}

async function enviarPushTeste(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token FCM não informado");
  }

  const messaging = iniciarFirebase();

  const message = {
    token: token.trim(),

    data: {
      type: "test",
      source: "invertus"
    },

    android: {
      priority: "high",
      ttl: 30000
    }
  };

  const messageId = await messaging.send(message);

  console.log("[FCM] Mensagem enviada:", messageId);

  return messageId;
}

module.exports = {
  iniciarFirebase,
  enviarPushTeste
};
