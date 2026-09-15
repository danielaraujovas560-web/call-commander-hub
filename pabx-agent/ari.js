const ari = require("ari-client");

const ARI_URL = process.env.ARI_URL;
const ARI_USER = process.env.ARI_USER;
const ARI_PASSWORD = process.env.ARI_PASSWORD;

let client = null;

async function connectARI() {
  try {
    console.log("[ARI] conectando...");

    client = await ari.connect(
      ARI_URL,
      ARI_USER,
      ARI_PASSWORD
    );

    console.log("[ARI] conectado ao Asterisk");

    registrarEventosARI(client);

    await client.start("pabx-agent");

    await client.applications.subscribe({
      applicationName: "pabx-agent",
      eventSource: ["channel:", "bridge:", "endpoint:", "deviceState:"]
    });

    console.log("[ARI] recebendo eventos");

    return client;
  } catch (err) {
    console.error("[ARI] falha ao conectar:", err);

    setTimeout(connectARI, 5000);
  }
}

function registrarEventosARI(client) {
  client.on("EndpointStateChange", (event) => {
    console.log("[ARI][EndpointStateChange]", {
      endpoint: event.endpoint?.name,
      state: event.endpoint?.state,
    });
  });

  client.on("ChannelCreated", (event) => {
    console.log("[ARI][ChannelCreated]", JSON.stringify(event, null, 2));
  });

  client.on("ChannelStateChange", (event) => {
    console.log("[ARI][ChannelStateChange]", {
      id: event.channel?.id,
      name: event.channel?.name,
      state: event.channel?.state,
    });
  });

  client.on("ChannelDestroyed", (event) => {
    console.log("[ARI][ChannelDestroyed]", {
      id: event.channel?.id,
      name: event.channel?.name,
      cause: event.cause,
      causeText: event.cause_txt,
    });
  });

  client.on("Dial", (event) => {
    console.log("[ARI][Dial]", {
      caller: event.caller?.name,
      peer: event.peer?.name,
      dialstatus: event.dialstatus,
      dialstring: event.dialstring,
    });
  });

  client.on("BridgeCreated", (event) => {
    console.log("[ARI][BridgeCreated]", event.bridge?.id);
  });

  client.on("BridgeDestroyed", (event) => {
    console.log("[ARI][BridgeDestroyed]", event.bridge?.id);
  });
}

module.exports = {
  connectARI,
};
