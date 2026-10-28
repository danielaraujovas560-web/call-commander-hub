const readline = require("readline");

const {
  iniciarFirebase,
  enviarPushTeste
} = require("../services/firebase");

async function main() {
  iniciarFirebase();

  if (!process.env.FCM_TEST_TOKEN) {
    throw new Error(
      "Defina FCM_TEST_TOKEN com o token do Android."
    );
  }

  console.log("[FCM] Iniciando teste de notificação");

  const id = await enviarPushTeste(
    process.env.FCM_TEST_TOKEN
  );

  console.log("[FCM] Teste enviado. ID:", id);
}

main().catch(error => {
  console.error(
    "[FCM] Falha:",
    error.code || error.message
  );

  process.exitCode = 1;
});
