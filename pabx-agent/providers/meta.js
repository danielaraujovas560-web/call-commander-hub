const axios = require("axios");

const META_API_VERSION = "v25.0";

function normalizarTelefone(numero) {
  const telefone = String(numero ?? "").replace(/\D/g, "");

  if (!/^\d{10,15}$/.test(telefone)) {
    throw new Error("Número de destino inválido");
  }

  return telefone;
}

async function enviarTemplateMeta({
  phoneNumberId,
  accessToken,
  destinatario,
  templateNome,
  templateIdioma = "pt_BR",
  parametros = [],
}) {
  if (!/^\d+$/.test(String(phoneNumberId))) {
    throw new Error("Phone Number ID inválido");
  }

  if (!accessToken) {
    throw new Error("Token da Meta não configurado");
  }

  const components = parametros.length
    ? [
        {
          type: "body",
          parameters: parametros.map((valor) => ({
            type: "text",
            text: String(valor),
          })),
        },
      ]
    : [];

  const payload = {
    messaging_product: "whatsapp",
    to: normalizarTelefone(destinatario),
    type: "template",
    template: {
      name: templateNome,
      language: {
        code: templateIdioma,
      },
      ...(components.length ? { components } : {}),
    },
  };

  const response = await axios.post(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return {
    messageId: response.data.messages?.[0]?.id ?? null,
    response: response.data,
  };
}

module.exports = {
  enviarTemplateMeta,
};
