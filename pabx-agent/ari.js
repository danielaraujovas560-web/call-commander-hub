const ari = require("ari-client");
const logger = require("./utils/logger");

const ARI_URL = process.env.ARI_URL;
const ARI_USER = process.env.ARI_USER;
const ARI_PASSWORD = process.env.ARI_PASSWORD;
const ARI_APP_NAME = process.env.ARI_APP_NAME;

let client = null;
let connecting = null;
let onClientReady = null;
let replacementScheduled = false;

function setAriClientHandler(handler) {
  onClientReady = handler;
}

async function notificarClientePronto(ariClient, reconectado) {
  if (typeof onClientReady !== "function") return;
  try {
    await onClientReady(ariClient, { reconectado });
  } catch (err) {
    logger.error("[ARI] erro no callback de inicialização/reconciliação:", err);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectARI() {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    while (!client) {
      try {
        logger.debug("[ARI] conectando...");

        const novoClient = await ari.connect(
          ARI_URL,
          ARI_USER,
          ARI_PASSWORD
        );

        registrarEventosARI(novoClient);

        // O evento WebSocketConnected também é emitido quando o socket
        // recupera a conexão sem trocar o objeto Client.
        novoClient.on("WebSocketConnected", () => {
          if (client !== novoClient) return;
          logger.info("[ARI] WebSocket reconectado; reconciliando estado dos ramais...");
          notificarClientePronto(novoClient, true);
        });

        novoClient.on("WebSocketReconnecting", (err) => {
          logger.warn("[ARI] WebSocket desconectado; tentando reconectar:", err?.message || err || "sem detalhes");
        });

        novoClient.on("WebSocketMaxRetries", (err) => {
          if (client !== novoClient || replacementScheduled) return;

          replacementScheduled = true;
          logger.error("[ARI] limite de reconexões do WebSocket atingido; será criado um novo cliente:", err?.message || err || "sem detalhes");
          client = null;

          setTimeout(async () => {
            replacementScheduled = false;
            try {
              const novo = await connectARI();
              if (novo) await notificarClientePronto(novo, false);
            } catch (reconnectError) {
              logger.error("[ARI] falha ao substituir cliente após esgotar reconexões:", reconnectError);
            }
          }, 5000);
        });

        // Este monitor observa o Asterisk inteiro, não apenas canais que entram no Stasis.
        // Sem subscribeAll=true, os eventos de chamadas/ramais de outros contextos não chegam.
        await Promise.resolve(novoClient.start(ARI_APP_NAME, true));

        client = novoClient;
        logger.info("[ARI] conectado ao Asterisk");
        logger.debug("[ARI] WebSocket de eventos solicitado");
        await notificarClientePronto(client, false);

        return client;
      } catch (err) {
        logger.error("[ARI] falha ao conectar; nova tentativa em 5 segundos:", err);
        await delay(5000);
      }
    }

    return client;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
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
  setAriClientHandler,
};
