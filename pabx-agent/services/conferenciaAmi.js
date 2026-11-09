const {
    amiAction,
    amiReady,
    nextActionId
} = require("../ami");

async function convidarRamal({
    tenantId,
    conferencia,
    endpoint
}) {
    if (!amiReady()) {
        throw new Error("AMI desconectado");
    }

    const tenant = Number(tenantId);
    const id = Number(conferencia?.id);
    const limite = Number(conferencia?.max_participantes);
    const intervalo = Number(conferencia?.mixing_interval);

    // O registro precisa vir do banco, filtrado pelo tenant.
    if (
        !Number.isSafeInteger(tenant) || tenant < 1 ||
        !Number.isSafeInteger(id) || id < 1 ||
        Number(conferencia?.tenant_id) !== tenant ||
        conferencia?.tipo !== "INTERNA" ||
        Number(conferencia?.ativo) !== 1
    ) {
        throw new Error("Conferencia nao autorizada");
    }

    if (
        !Number.isInteger(limite) ||
        limite < 2 ||
        limite > 100 ||
        ![10, 20, 40, 80].includes(intervalo)
    ) {
        throw new Error("Configuracao da conferencia invalida");
    }

    // Exemplo: 12000-mobile
    if (
        typeof endpoint !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(endpoint)
    ) {
        throw new Error("Endpoint invalido");
    }

    const actionId = nextActionId();
    const sala = `cc-t${tenant}-i${id}`;

    const resposta = await amiAction({
        action: "Originate",
        actionid: actionId,

        channel: `PJSIP/${endpoint}`,

        context: "CC-CONFERENCIA-INTERNA",
        exten: "s",
        priority: 1,

        callerid: `Conferencia <${conferencia.ramal}>`,
        timeout: 30000,
        async: "true",

        variable: {
            TENANT_ID: String(tenant),
            CONFERENCIA_ID: String(id),
            CONFERENCIA_AUTORIZADA: "1",
            CONFERENCIA_MAX: String(limite),
            CONFERENCIA_GRAVAR:
                Number(conferencia.gravar) === 1 ? "yes" : "no",
            CONFERENCIA_INTERVALO: String(intervalo)
        }
    });

    if (String(resposta?.response || "").toLowerCase() !== "success") {
        throw new Error(
            resposta?.message || "Originate rejeitado pelo AMI"
        );
    }

    console.log("[CONFERENCIA] Convite solicitado:", {
        actionId,
        sala,
        endpoint
    });

    return {
        actionId,
        sala,
        endpoint,
        status: "SOLICITADO"
    };
}

module.exports = {
    convidarRamal
};
