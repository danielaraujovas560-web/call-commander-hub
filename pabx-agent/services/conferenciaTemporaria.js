// Coordena uma chamada já estabelecida -> conferência temporária.
// Depende de ami.js existente, com onAmiEvent exportado (ver ami-adicoes.txt).
// Primeira etapa: convidados INTERNOS, sem originar por tronco.

const db = require("../config/db");
const {
  amiAction,
  amiReady,
  nextActionId,
  onAmiEvent,
  onConferenceEvent,
} = require("../ami");

const chamadasEmTransicao = new Set();
const pendentes = new Map();

function campo(evt, nome) {
  return evt?.[nome.toLowerCase()] ?? evt?.[nome] ?? "";
}

function nomeEvento(evt) {
  return String(campo(evt, "Event")).toLowerCase();
}

function assertAmiOk(res, nome) {
  if (String(campo(res, "Response")).toLowerCase() !== "success") {
    throw new Error(`${nome}: ${campo(res, "Message") || JSON.stringify(res)}`);
  }
  return res;
}

function checkPjsipChannel(nome) {
  return typeof nome === "string" && /^PJSIP\/[a-zA-Z0-9_-]{1,80}-[0-9a-f]{8,16}$/i.test(nome);
}

function checkEndpoint(nome) {
  return typeof nome === "string" && /^\d{1,20}(?:-(?:web|mobile))?$/.test(nome);
}

function checkInt(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function listaCanais(timeoutMs = 6000) {
  // A resposta direta do AMI só confirma a requisição; os canais vêm por eventos.
  return new Promise((resolve, reject) => {
    const actionId = nextActionId();
    const itens = [];
    let terminou = false;
    const encerrar = (err) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      unsubscribe();
      if (err) reject(err);
      else resolve(itens);
    };
    const unsubscribe = onAmiEvent((evt) => {
      if (String(campo(evt, "ActionID")) !== actionId) return;
      const tipo = nomeEvento(evt);
      if (tipo === "coreshowchannel") itens.push(evt);
      if (tipo === "coreshowchannelscomplete") encerrar();
    });
    const timer = setTimeout(() => encerrar(new Error("Timeout CoreShowChannels")), timeoutMs);
    amiAction({ action: "CoreShowChannels", actionid: actionId }, timeoutMs)
      .then((r) => assertAmiOk(r, "CoreShowChannels"))
      .catch(encerrar);
  });
}

async function getVar(canal, variavel) {
  const r = assertAmiOk(
    await amiAction({ action: "Getvar", channel: canal, variable: variavel }),
    `Getvar(${variavel})`,
  );
  return String(campo(r, "Value") || "");
}

async function validarLigacao(tenantId, origem, destino = null) {
  const canais = await listaCanais();
  const p1 = canais.find((c) => campo(c, "Channel") === origem);
  const p2 = destino ? canais.find((c) => campo(c, "Channel") === destino) : null;
  if (!p1 || (destino && !p2)) throw new Error("Um dos canais da chamada não está mais ativo");

  const bridge1 = String(campo(p1, "BridgeId"));
  if (!bridge1) throw new Error("Canal de origem não está numa bridge ativa");
  const membros = canais.filter((c) => String(campo(c, "BridgeId")) === bridge1);
  if (membros.length !== 2) {
    throw new Error("A bridge original não contém exatamente dois canais");
  }
  if (membros.some((c) => /confbridge/i.test(String(campo(c, "Application"))))) {
    throw new Error("Essa chamada já está dentro de uma conferência");
  }
  const outro = p2 || membros.find((c) => campo(c, "Channel") !== origem);
  if (!outro || !checkPjsipChannel(String(campo(outro, "Channel"))) ||
      String(campo(outro, "BridgeId")) !== bridge1) {
    throw new Error("O outro canal não é um PJSIP válido na mesma bridge");
  }
  if (destino && String(campo(outro, "Channel")) !== destino) {
    throw new Error("O canal informado não pertence à chamada de origem");
  }

  if (
    String(campo(p1, "ChannelStateDesc")).toLowerCase() !== "up" ||
    String(campo(outro, "ChannelStateDesc")).toLowerCase() !== "up"
  ) {
    throw new Error("Os dois canais precisam estar atendidos (Up)");
  }

  // Nem todos os cenários preservam linkedid idêntico após transferências.
  // Por segurança, nesta primeira versão exigimos a mesma ligação original.
  const linkedid = String(campo(p1, "Linkedid"));
  if (!linkedid || linkedid !== String(campo(outro, "Linkedid"))) {
    throw new Error("Os canais não pertencem ao mesmo linkedid");
  }

  const t1 = await getVar(origem, "TENANT_ID");
  const t2 = await getVar(String(campo(outro, "Channel")), "TENANT_ID");
  if (String(tenantId) !== t1 || (t2 && t2 !== String(tenantId))) {
    throw new Error("Tenant dos canais não confere com o solicitado");
  }

  return { linkedid, bridgeId: bridge1, origem: p1, destino: outro };
}

function observarConvite({ sala, endpoint, actionId, timeoutMs = 45000 }) {
  let unsubscribe;
  let timer;
  let finalizado = false;
  let resolvePromessa;
  let rejectPromessa;
  const promise = new Promise((resolve, reject) => {
    resolvePromessa = resolve;
    rejectPromessa = reject;
  });
  const terminar = (erro, canal) => {
    if (finalizado) return;
    finalizado = true;
    clearTimeout(timer);
    if (unsubscribe) unsubscribe();
    if (erro) rejectPromessa(erro);
    else resolvePromessa(canal);
  };
  unsubscribe = onConferenceEvent((evt) => {
    const nome = nomeEvento(evt);
    if (nome === "originateresponse" && String(campo(evt, "ActionID")) === actionId) {
      if (String(campo(evt, "Response")).toLowerCase() === "failure") {
        terminar(new Error(`Convidado não atendeu: reason=${campo(evt, "Reason")}`));
      }
    }
    if (nome === "confbridgejoin" && String(campo(evt, "Conference")) === sala) {
      const canal = String(campo(evt, "Channel"));
      if (canal.startsWith(`PJSIP/${endpoint}-`)) terminar(null, canal);
    }
  });
  timer = setTimeout(() => terminar(new Error("Tempo limite aguardando convidado entrar na sala")), timeoutMs);
  return { promise, cancelar: (erro) => terminar(erro || new Error("Convite cancelado")) };
}

function observarEntradaDaChamada(sala, canais, timeoutMs = 12000) {
  let unsubscribe;
  let timer;
  let finalizado = false;
  let resolvePromessa;
  let rejectPromessa;
  const aguardados = new Set(canais);
  const promise = new Promise((resolve, reject) => {
    resolvePromessa = resolve;
    rejectPromessa = reject;
  });
  const terminar = (erro) => {
    if (finalizado) return;
    finalizado = true;
    clearTimeout(timer);
    if (unsubscribe) unsubscribe();
    if (erro) rejectPromessa(erro);
    else resolvePromessa();
  };
  unsubscribe = onConferenceEvent((evt) => {
    if (nomeEvento(evt) !== "confbridgejoin") return;
    if (String(campo(evt, "Conference")) !== sala) return;
    aguardados.delete(String(campo(evt, "Channel")));
    if (aguardados.size === 0) terminar();
  });
  timer = setTimeout(() => terminar(new Error(`Entrada incompleta: faltando ${[...aguardados].join(", ")}`)), timeoutMs);
  return { promise, cancelar: (erro) => terminar(erro || new Error("Entrada cancelada")) };
}

async function setVar(canal, variavel, valor) {
  assertAmiOk(
    await amiAction({
      action: "Setvar",
      channel: canal,
      variable: variavel,
      value: String(valor),
    }),
    `Setvar(${variavel})`,
  );
}

async function salvarEstado(id, tenantId, estado, encerrado = false) {
  await db.execute(
    `UPDATE conferencias
     SET estado = ?, closed_at = CASE WHEN ? = 1 THEN NOW() ELSE closed_at END,
         ativo = CASE WHEN ? = 1 THEN 0 ELSE ativo END
     WHERE id = ? AND tenant_id = ? AND tipo = 'CHAMADA'`,
    [estado, encerrado ? 1 : 0, encerrado ? 1 : 0, id, tenantId],
  );
}

async function realizarConversao(sessao) {
  const { tenantId, id, sala, canalOrigem, canalDestino, endpointConvidado, limite, gravar, intervalo, actionId } = sessao;
  const variaveis = {
    CC_SALA: sala,
    CC_CONF_AUTH: "1",
    CC_MAX: String(limite),
    CC_GRAVAR: gravar ? "yes" : "no",
    CC_INTERVALO: String(intervalo),
  };
  let moverIniciado = false;
  let canalConvidado = null;
  const espera = observarConvite({ sala, endpoint: endpointConvidado, actionId });
  // Evita unhandledRejection quando a action falha antes do await do evento.
  void espera.promise.catch(() => {});

  try {
    const identificacao = String(campo(sessao.infoOrigem, "CallerIDNum") || "").replace(/\D/g, "").slice(0, 20);
    const resposta = await amiAction({
      action: "Originate",
      actionid: actionId,
      channel: `PJSIP/${endpointConvidado}`,
      context: "CC-CONFERENCIA-TEMP",
      exten: "s",
      priority: 1,
      timeout: 30000, // AMI: milissegundos
      async: "true",
      callerid: `Conferencia <${identificacao || "9001"}>`,
      variable: { ...variaveis, CC_PARTICIPANTE: endpointConvidado },
    });
    assertAmiOk(resposta, "Originate");
    canalConvidado = await espera.promise;
    await salvarEstado(id, tenantId, "CONVIDADO_CONECTADO");

    // Confere novamente: a ligação original não pode ter mudado enquanto tocava.
    const atual = await validarLigacao(tenantId, canalOrigem, canalDestino);
    if (atual.bridgeId !== sessao.bridgeId || atual.linkedid !== sessao.linkedid) {
      throw new Error("A ligação original mudou durante o convite");
    }

    // Prepare ambos os canais antes de tocar no bridge original.
    for (const canal of [canalOrigem, canalDestino]) {
      for (const [chave, valor] of Object.entries(variaveis)) {
        await setVar(canal, chave, valor);
      }
    }

    // O observador é instalado antes de disparar o Redirect (evita race).
    const entrada = observarEntradaDaChamada(sala, [canalOrigem, canalDestino]);
    void entrada.promise.catch(() => {});
    try {
      moverIniciado = true;
      assertAmiOk(await amiAction({
        action: "Redirect",
        actionid: nextActionId(),
        channel: canalOrigem,
        extrachannel: canalDestino,
        context: "CC-CONFERENCIA-TEMP",
        exten: "s",
        priority: 1,
        extracontext: "CC-CONFERENCIA-TEMP",
        extraexten: "s",
        extrapriority: 1,
      }), "Redirect");
      await entrada.promise;
    } catch (e) {
      entrada.cancelar(e);
      throw e;
    }

    await salvarEstado(id, tenantId, "ATIVA");
    console.log("[CONF TEMP] Conversão concluída:", { sala, canalOrigem, canalDestino, canalConvidado });
  } catch (erro) {
    espera.cancelar(erro);
    const estado = moverIniciado ? "ERRO_TRANSICAO" : "FALHOU";
    try {
      await salvarEstado(id, tenantId, estado, !moverIniciado);
    } catch (e) {
      console.error("[CONF TEMP] Erro salvando estado:", e);
    }
    if (!moverIniciado && canalConvidado) {
      try {
        // NUNCA desliga as pernas originais; apenas o convite criado por nós.
        await amiAction({ action: "Hangup", channel: canalConvidado });
      } catch (e) {
        console.error("[CONF TEMP] Não foi possível encerrar convite isolado:", e);
      }
    }
    // Se a mudança já começou, não encerramos automaticamente canais:
    // isso poderia derrubar uma conversa parcialmente transferida.
    console.error("[CONF TEMP] Falha:", { sala, estado, erro: erro.message });
  } finally {
    chamadasEmTransicao.delete(sessao.chave);
    pendentes.delete(id);
  }
}

async function iniciar({ tenantId, canalOrigem, canalDestino, endpointConvidado }) {
  const tenant = checkInt(tenantId);
  if (!tenant || !checkPjsipChannel(canalOrigem) ||
      (canalDestino != null && !checkPjsipChannel(canalDestino)) ||
      canalOrigem === canalDestino || !checkEndpoint(endpointConvidado)) {
    throw new Error("Parâmetros inválidos para conferência temporária");
  }
  if (!amiReady()) throw new Error("AMI indisponível");

  // A API pode receber apenas canalOrigem: o par é identificado pela bridge.
  const atual = await validarLigacao(tenant, canalOrigem, canalDestino);
  canalDestino = String(campo(atual.destino, "Channel"));
  const chave = [canalOrigem, canalDestino].sort().join("|");
  if (chamadasEmTransicao.has(chave)) throw new Error("Essa ligação já está sendo convertida");
  chamadasEmTransicao.add(chave);

  try {

    // IMPORTANTE: coluna endpoint_id da tabela ramais, como no seu Call Commander.
    // Sem a validação, um cliente poderia convidar endpoint de outro tenant.
const ramalLogico = endpointConvidado.replace(/-(web|mobile)$/, "");

const [ramais] = await db.execute(
  `SELECT endpoint_id FROM ramais
   WHERE tenant_id = ? AND endpoint_id = ?
   LIMIT 1`,
  [tenant, ramalLogico],
);
    if (!ramais.length) throw new Error("Ramal convidado não pertence ao tenant");

    const limite = 10;
    const gravar = false;
    const intervalo = 20;
    const [result] = await db.execute(
      `INSERT INTO conferencias
         (tenant_id, nome, ramal, tipo, max_participantes, gravar,
          mixing_interval, permitir_video, ativo, linkedid, estado)
       VALUES (?, ?, NULL, 'CHAMADA', ?, ?, ?, 0, 1, ?, 'CONVIDANDO')`,
      [tenant, "Conferencia temporaria", limite, gravar ? 1 : 0, intervalo, atual.linkedid],
    );
    const id = Number(result.insertId);
    const sala = `cc-t${tenant}-c${id}`;
    const actionId = nextActionId();
    const sessao = {
      id, tenantId: tenant, sala, canalOrigem, canalDestino, endpointConvidado,
      limite, gravar, intervalo, actionId,
      linkedid: atual.linkedid, bridgeId: atual.bridgeId, infoOrigem: atual.origem, chave,
    };
    pendentes.set(id, sessao);
    // A execução de convite e Redirect continua no processo Node.
    // Erros são tratados e registrados em realizarConversao().
    void realizarConversao(sessao);
    return { id, sala, actionId, estado: "CONVIDANDO" };
  } catch (erro) {
    chamadasEmTransicao.delete(chave);
    throw erro;
  }
}

async function consultar({ tenantId, id }) {
  const tenant = checkInt(tenantId);
  const conferenciaId = checkInt(id);
  if (!tenant || !conferenciaId) throw new Error("Parâmetros inválidos");
  const [rows] = await db.execute(
    `SELECT id, nome, tipo, estado, ativo, criado_em, closed_at, linkedid
     FROM conferencias WHERE id = ? AND tenant_id = ? AND tipo = 'CHAMADA' LIMIT 1`,
    [conferenciaId, tenant],
  );
  return rows[0] || null;
}

// Marca como encerrada a sessão temporária quando o Asterisk destrói a sala.
// Esta assinatura deve ser instalada uma única vez no início do serviço.
let monitorInstalado = false;
function iniciarMonitoramento() {
  if (monitorInstalado) return;
  monitorInstalado = true;
  onConferenceEvent((evt) => {
    if (nomeEvento(evt) !== "confbridgeend") return;
    const sala = String(campo(evt, "Conference"));
    const m = /^cc-t(\d+)-c(\d+)$/.exec(sala);
    if (!m) return;
    const tenant = Number(m[1]);
    const id = Number(m[2]);
    void db.execute(
      `UPDATE conferencias SET estado='ENCERRADA', ativo=0, closed_at=NOW()
       WHERE tenant_id=? AND id=? AND tipo='CHAMADA' AND estado='ATIVA'`,
      [tenant, id],
    ).catch((err) => console.error("[CONF TEMP] Falha ao encerrar sala:", err));
  });
}

module.exports = { iniciar, consultar, iniciarMonitoramento };
