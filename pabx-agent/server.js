// pabx-agent — mini servidor HTTP que conversa com seu MariaDB Asterisk.
// Autentica via HMAC-SHA256 (compatível com src/lib/agent.server.ts do Lovable).

require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");

const hmacMiddleware = require("./middleware/hmac");
const requireJwt = require("./middleware/jwt");
const tenantMiddleware = require("./middleware/auth-middle");
const pool = require("./config/db");
const { restoreQueueMembers } = require("./utils/queue-restore");

// Rotas
const interno = require("./routes/interno");
const health = require("./routes/health");
const tenantRoutes = require("./routes/tenant");
const authRoutesClient = require("./routes/auth");
const authRoutesRamalWeb = require("./routes/auth-web");
const auditLogs = require("./routes/audit");
const configGeral = require("./routes/config-geral");
const adminUsersRoutes = require("./routes/admin-users");
const adminTenantRoutes = require("./routes/admin-tenants");
const dashboard = require("./routes/dashboard");
const clientes = require("./routes/clientes");
const ramaisWeb = require("./routes/ramal-web");
const ramais = require("./routes/ramal");
const troncos = require("./routes/tronco");
const filas = require("./routes/fila");
const filasAgentes = require("./routes/fila-agente");
const endpointStatus = require("./routes/endpoint-status");
const blacklist = require("./routes/blacklist");
const cdr = require("./routes/cdr");
const uras = require("./routes/ura");
const urasOpcoes = require("./routes/ura-opcoes");
const ia = require("./routes/ia");
const roteamento = require("./routes/roteamento");
const regraHorario = require("./routes/regra-horario");
const horarioRamais = require("./routes/horario-ramais");
const horarioRamaisMembros = require("./routes/horario-ramais-membros");
const pesquisaSatisfacao = require("./routes/pesquisa-satisfacao");
const gravacoes = require("./routes/gravacao");
const audios = require("./routes/audios");
const firewall = require("./routes/firewall");

const { amiCommand, queueAdd, queueRefresh, onAmiConnect, getQueueStatus } = require("./ami");
const { iniciarMonitor } = require("./ramal-monitor");
const { connectARI } = require("./ari");

const { PABX_AGENT_SECRET, JWT_SECRET, PORT = "8787", AUDIO_UPLOAD_LIMIT = "1gb" } = process.env;

if (!PABX_AGENT_SECRET || PABX_AGENT_SECRET.length < 16) {
  console.error("PABX_AGENT_SECRET ausente ou curto demais (>=16 chars). Edite .env e reinicie.");
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
app.use(interno);
app.use(authRoutesClient);
app.use(authRoutesRamalWeb);

// Tudo para baixo, usa JWT
app.use(requireJwt);
app.use(adminUsersRoutes);
app.use(adminTenantRoutes);
app.use(firewall);
app.use(clientes);
app.use(configGeral);

app.use(tenantMiddleware);

app.use(tenantRoutes);
app.use(auditLogs);
app.use(dashboard);
app.use(ramaisWeb);
app.use(ramais);
app.use(troncos);
app.use(endpointStatus);
app.use(filas);
app.use(filasAgentes);
app.use(blacklist);
app.use(cdr);
app.use(uras);
app.use(urasOpcoes);
app.use(ia);
app.use(roteamento);
app.use(regraHorario);
app.use(horarioRamais);
app.use(horarioRamaisMembros);
app.use(pesquisaSatisfacao);
app.use(gravacoes);
app.use(audios);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

const server = app.listen(Number(PORT), () => {
  console.log(`[pabx-agent] ouvindo em http://127.0.0.1:${PORT}`);
});
