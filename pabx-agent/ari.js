const ari = require("ari-client");
const logger = require("./utils/logger");

const ARI_URL = process.env.ARI_URL;
const ARI_USER = process.env.ARI_USER;
const ARI_PASSWORD = process.env.ARI_PASSWORD;
const ARI_APP_NAME = process.env.ARI_APP_NAME;

let client = null;

async function connectARI() {
  try {
    logger.debug("[ARI] conectando...");

    client = await ari.connect(
      ARI_URL,
      ARI_USER,
      ARI_PASSWORD
    );

    logger.info("[ARI] conectado ao Asterisk");

    registrarEventosARI(client);

    client.start(ARI_APP_NAME);

    logger.debug("[ARI] WebSocket de eventos solicitado");

    return client;

  } catch (err) {
    logger.error("[ARI] falha ao conectar:", err);

    setTimeout(connectARI, 5000);

    return null;
  }
}

function registrarEventosARI(client) {
  client.on("EndpointStateChange", (event) => {
    logger.debug("[ARI][EndpointStateChange]", {
      endpoint: event.endpoint?.name,
      state: event.endpoint?.state,
    });
  });

  client.on("ChannelCreated", (event) => {
    logger.debug("[ARI][ChannelCreated]", {
      id: event.channel?.id,
      name: event.channel?.name,
    });
  });

  client.on("ChannelStateChange", (event) => {
    logger.debug("[ARI][ChannelStateChange]", {
      id: event.channel?.id,
      name: event.channel?.name,
      state: event.channel?.state,
    });
  });

  client.on("ChannelDestroyed", (event) => {
    logger.debug("[ARI][ChannelDestroyed]", {
      id: event.channel?.id,
      name: event.channel?.name,
      cause: event.cause,
      causeText: event.cause_txt,
    });
  });

  client.on("Dial", (event) => {
    logger.debug("[ARI][Dial]", {
      caller: event.caller?.name,
      peer: event.peer?.name,
      dialstatus: event.dialstatus,
      dialstring: event.dialstring,
    });
  });

  client.on("BridgeCreated", (event) => {
    logger.debug("[ARI][BridgeCreated]", event.bridge?.id);
  });

  client.on("BridgeDestroyed", (event) => {
    logger.debug("[ARI][BridgeDestroyed]", event.bridge?.id);
  });
}

module.exports = {
  connectARI,
};
