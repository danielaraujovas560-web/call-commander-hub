const { amiCommand } = require("../ami");

function amiPjsipReload() {
  return amiCommand("pjsip reload").catch((e) => {
    console.error("[ami] pjsip reload falhou:", e.message || e);
  });
}
function amiQueueReloadAll() {
  return amiCommand("queue reload all").catch((e) => {
    console.error("[ami] queue reload all falhou:", e.message || e);
  });
}

function amiQueueReloadParameters(queueName) {
  return amiCommand(`queue reload parameters ${queueName}`).catch((e) => {
    console.error(`[ami] queue reload parameters ${queueName} falhou:`, e.message || e);
  });
}

module.exports = {
  amiPjsipReload,
  amiQueueReloadAll,
  amiQueueReloadParameters,
};
