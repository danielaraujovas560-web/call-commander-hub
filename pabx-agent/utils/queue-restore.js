const pool = require("../config/db");
const { queueAdd, getQueueStatus } = require("../ami");

async function restoreQueueMembers(queueName = null) {
  console.log("[queue-restore] verificando membros ativos no Asterisk...");

  const activeMembers = await getQueueStatus();

  console.log("[queue-restore] consultando banco de dados...");

  try {
    const [agentes] = await pool.query(
      `
      SELECT
        fa.id,
        fa.tenant_id,
        fa.queue,
        fa.interface,
        fa.penalty,
        fa.membername,
        fa.ramal,
        fa.state_interface
      FROM filas_agentes fa
      INNER JOIN filas f
        ON f.name = fa.queue
       AND f.tenant_id = fa.tenant_id
      WHERE f.ativo = 1
      ${queueName ? "AND fa.queue = ?" : ""}
      ORDER BY fa.queue, fa.penalty, fa.id
      `,
      queueName ? [queueName] : [],
    );

    console.log(`[queue-restore] ${agentes.length} membros registrados no banco.`);

    for (const agente of agentes) {
      const chaveUnica = `${agente.queue.toLowerCase()}|${agente.interface.toLowerCase()}`;

      if (activeMembers.has(chaveUnica)) continue;

      try {
        await queueAdd({
          queue: agente.queue,
          interface: agente.interface,
          penalty: agente.penalty,
          memberName: agente.membername,
          stateInterface: agente.state_interface,
        });
      } catch (err) {
        console.error(
          `[queue-restore] falha ao restaurar ${agente.interface} ` +
            `na fila ${agente.queue}:`,
          err.message || err,
        );
      }
    }

    console.log("[queue-restore] sincronização inteligente concluída.");
  } catch (err) {
    console.error(
      "[queue-restore] erro consultando filas_agentes:",
      err.message || err,
    );
  }
}

module.exports = {
  restoreQueueMembers,
};
