// pabx-agent — mini servidor HTTP que conversa com seu MariaDB Asterisk.
// Autentica via HMAC-SHA256 (compatível com src/lib/agent.server.ts do Lovable).

require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");

const hmacMiddleware = require("./middleware/hmac");
const pool = require("./config/db");

// Rotas
const health = require("./routes/health");
const tenantRoutes = require("./routes/tenant");
const authRoutes = require("./routes/auth");
const auditLogs = require("./routes/audit");
const adminUsersRoutes  = require("./routes/admin-users");
const adminTenantRoutes = require("./routes/admin-tenants");
const dashboard = require("./routes/dashboard");
const clientes = require("./routes/clientes");
const ramaisWeb = require("./routes/ramal-web")
const ramais = require("./routes/ramal");
const troncos = require("./routes/tronco");
const filas = require("./routes/fila");
const filasAgentes = require("./routes/fila-agente");
const endpointStatus = require("./routes/endpoint-status");
const blacklist = require("./routes/blacklist");
const cdr = require("./routes/cdr");
const uras = require("./routes/ura");
const urasOpcoes = require("./routes/ura-opcoes");
const roteamento = require("./routes/roteamento");
const regraHorario = require("./routes/regra-horario");
const horarioRamais = require("./routes/horario-ramais");
const horarioRamaisMembros = require("./routes/horario-ramais-membros");
const pesquisaSatisfacao = require("./routes/pesquisa-satisfacao");
const gravacoes = require("./routes/gravacao");
const audios = require("./routes/audios");
const firewall = require("./routes/firewall");

const {
  amiCommand,
  queueAdd,
  queueRefresh,
  onAmiConnect,
  getQueueStatus,
} = require("./ami");
const { iniciarMonitor } = require("./ramal-monitor");
const { connectARI  } = require("./ari");

const {
  AGENT_SECRET,
  JWT_SECRET,
  PORT = "8787",
  AUDIO_UPLOAD_LIMIT = "1gb",
} = process.env;

if (!AGENT_SECRET || AGENT_SECRET.length < 16) {
  console.error("AGENT_SECRET ausente ou curto demais (>=16 chars). Edite .env e reinicie.");
  process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET ausente ou curto demais. Edite .env e reinicie.");
  process.exit(1);
}

function amiQueueReloadAll() {
  return amiCommand("queue reload all").catch((e) => {
    console.error("[ami] queue reload all falhou:", e.message || e);
  });
}

// Função auxiliar para mapear o status atual das filas via AMI
async function getActiveQueueMembers() {
  return new Promise((resolve) => {
    const activeMembers = new Set();

    // Evento que traz cada membro ativo na fila
    function onQueueMember(evt) {
      // Ex: evt.queue e evt.interface (ex: PJSIP/19999)
      if (evt.queue && evt.interface) {
        activeMembers.add(`${evt.queue}|${evt.interface}`);
      }
    }

    // Evento que avisa quando acabou a listagem do QueueStatus
    function onQueueStatusComplete(evt) {
      cleanup();
      resolve(activeMembers);
    }

    function cleanup() {
      ami.removeListener("queuemember", onQueueMember);
      ami.removeListener("queuestatuscomplete", onQueueStatusComplete);
    }

    ami.on("queuemember", onQueueMember);
    ami.on("queuestatuscomplete", onQueueStatusComplete);

    // Dispara o comando QueueStatus para o Asterisk
    ami.action({ Action: "QueueStatus" }, (err) => {
      if (err) {
        cleanup();
        resolve(new Set()); // Se falhar, retorna vazio para garantir o restore tradicional
      }
    });

    // Timeout de segurança caso o Asterisk demore a responder
    setTimeout(() => {
      cleanup();
      resolve(activeMembers);
    }, 4000);
  });
}

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
          `[queue-restore] falha ao restaurar ${agente.interface} ` + `na fila ${agente.queue}:`,
          err.message || err,
        );
      }
    }

    console.log("[queue-restore] sincronização inteligente concluída.");
  } catch (err) {
    console.error("[queue-restore] erro consultando filas_agentes:", err.message || err);
  }
}

onAmiConnect(async () => {
  const ariClient = await connectARI();
  if (ariClient) iniciarMonitor(ariClient, server, pool.query.bind(pool));

  console.log("[queue-restore] AMI conectado.");

  // Dá tempo para o Asterisk terminar de inicializar as filas.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("[queue-restore] recarregando parâmetros das filas...");

  await amiQueueReloadAll();

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await restoreQueueMembers();
});

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: AUDIO_UPLOAD_LIMIT }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 240,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(hmacMiddleware);
app.use(health);
app.use(authRoutes);
app.use(tenantRoutes);
app.use(auditLogs);
app.use(ramaisWeb);
app.use(adminUsersRoutes);
app.use(adminTenantRoutes);
app.use(dashboard);
app.use(clientes);
app.use(ramais);
app.use(troncos);
app.use(endpointStatus);
app.use(filas);
app.use(filasAgentes);
app.use(blacklist);
app.use(cdr);
app.use(uras);
app.use(urasOpcoes);
app.use(roteamento);
app.use(regraHorario);
app.use(horarioRamais);
app.use(horarioRamaisMembros);
app.use(pesquisaSatisfacao);
app.use(gravacoes);
app.use(audios);
app.use(firewall);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

const server = app.listen(Number(PORT), () => {
  console.log(`[pabx-agent] ouvindo em http://127.0.0.1:${PORT}`);
});
