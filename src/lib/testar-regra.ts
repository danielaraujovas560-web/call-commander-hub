export type ModeloRegra = "E164" | "STFC";

export type RegraRoteamento = {
  id: number;
  tronco_identifier: string;
  modelo: ModeloRegra;
  nome: string;
  tipo_ligacao: string;
  expressao: string;
  expressao_transformada: string;
  prioridade: number;
  codigo_csp?: string | null;
  ativo: boolean;
};

export type ResultadoSimulacao = {
  sucesso: boolean;
  numero_original: string;
  numero_transformado: string | null;
  tipo_ligacao: string | null;
  regra_nome: string | null;
  prioridade: number | null;
  codigo_csp: string | null;
  mensagem: string;
};

const regrasFake: RegraRoteamento[] = [
  {
    id: 1,
    tronco_identifier: "t1-Invertus-Ativo-55",
    modelo: "STFC",
    nome: "Móvel DDD",
    tipo_ligacao: "movel",
    expressao: "^([0-9]{2})([0-9]{9})$",
    expressao_transformada: "0\\1\\2",
    prioridade: 1,
    codigo_csp: "015",
    ativo: true,
  },
  {
    id: 2,
    tronco_identifier: "t1-Invertus-Ativo-55",
    modelo: "STFC",
    nome: "Fixo DDD",
    tipo_ligacao: "fixo",
    expressao: "^([0-9]{2})([0-9]{8})$",
    expressao_transformada: "0\\1\\2",
    prioridade: 2,
    codigo_csp: "015",
    ativo: true,
  },
  {
    id: 3,
    tronco_identifier: "t1-Invertus-Ativo-55",
    modelo: "E164",
    nome: "Móvel E164",
    tipo_ligacao: "movel",
    expressao: "^55([0-9]{2})([0-9]{9})$",
    expressao_transformada: "0\\1\\2",
    prioridade: 1,
    codigo_csp: "015",
    ativo: true,
  },
  {
    id: 4,
    tronco_identifier: "t2-Invertus-Backup",
    modelo: "STFC",
    nome: "Móvel Backup",
    tipo_ligacao: "movel",
    expressao: "^([0-9]{2})([0-9]{9})$",
    expressao_transformada: "0\\1\\2",
    prioridade: 1,
    codigo_csp: null,
    ativo: true,
  },
];

export function listarRegrasFake(troncoIdentifier: string, modelo: ModeloRegra): RegraRoteamento[] {
  return regrasFake
    .filter(
      (regra) =>
        regra.ativo && regra.tronco_identifier === troncoIdentifier && regra.modelo === modelo,
    )
    .sort((a, b) => a.prioridade - b.prioridade);
}

export function testarRegra(
  troncoIdentifier: string,
  modelo: ModeloRegra,
  numero: string,
  dddAgente = "27",
): ResultadoSimulacao {
  const numeroLimpo = numero.trim();

  const resultadoVazio = (mensagem: string): ResultadoSimulacao => ({
    sucesso: false,
    numero_original: numeroLimpo,
    numero_transformado: null,
    tipo_ligacao: null,
    regra_nome: null,
    prioridade: null,
    codigo_csp: null,
    mensagem,
  });

  if (!numeroLimpo) {
    return resultadoVazio("Informe um número para testar.");
  }

  const regras = listarRegrasFake(troncoIdentifier, modelo);

  if (regras.length === 0) {
    return resultadoVazio("Não existem regras ativas para este tronco e modelo.");
  }

  for (const regra of regras) {
    try {
      const regex = new RegExp(regra.expressao);
      const correspondencia = regex.exec(numeroLimpo);

      if (!correspondencia) continue;

      const transformacao = regra.expressao_transformada
        .replace(/\$\{DDD_AGENTE\}/g, dddAgente)
        .replace(/\\(\d+)/g, (_, grupo: string) => `$${grupo}`);

      let numeroTransformado = numeroLimpo.replace(regex, transformacao);

      if (regra.codigo_csp) {
        numeroTransformado = `${regra.codigo_csp}${numeroTransformado}`;
      }

      return {
        sucesso: true,
        numero_original: numeroLimpo,
        numero_transformado: numeroTransformado,
        tipo_ligacao: regra.tipo_ligacao,
        regra_nome: regra.nome,
        prioridade: regra.prioridade,
        codigo_csp: regra.codigo_csp ?? null,
        mensagem: "Regra correspondente encontrada.",
      };
    } catch {
      return resultadoVazio(`A expressão da regra "${regra.nome}" é inválida.`);
    }
  }

  return resultadoVazio("Nenhuma regra corresponde ao número informado.");
}
