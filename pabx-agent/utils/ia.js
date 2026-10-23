const pool = require("../config/db");

function numeroValido(valor) {
  return valor !== undefined && valor !== null && valor !== "" && Number.isFinite(Number(valor));
}

async function validarModelo(id, tipo) {
  if (!numeroValido(id) || !Number.isInteger(Number(id))) {
    return false;
  }

  const [rows] = await pool.query(
    `
    SELECT id
    FROM ia_models
    WHERE id = ?
      AND tipo = ?
      AND ativo = 1
    LIMIT 1
    `,
    [id, tipo],
  );

  return rows.length > 0;
}

async function validarVozDoTenant(id, tenant) {
  const [rows] = await pool.query(
    `
    SELECT
      v.id,
      v.ia_model_id
    FROM ia_voices v
    INNER JOIN ia_models m
      ON m.id = v.ia_model_id
    WHERE v.id = ?
      AND v.tenant_id = ?
      AND m.tipo = 'Voz'
      AND m.ativo = 1
    LIMIT 1
    `,
    [id, tenant],
  );

  return rows[0] || null;
}

function validarConfiguracaoIA(body) {
  const {
    nome,
    ia_model_id_logica,
    ia_voice_id,
    confianca_minima,
    tempo_maximo,
    silencio_apos_fala,
    ativa,
  } = body;

  if (typeof nome !== "string" || !nome.trim() || nome.trim().length > 100) {
    return "O nome é obrigatório e deve ter até 100 caracteres";
  }

  if (
    !numeroValido(ia_model_id_logica) ||
    !Number.isInteger(Number(ia_model_id_logica)) ||
    Number(ia_model_id_logica) <= 0
  ) {
    return "Modelo lógico inválido";
  }

  if (
    !numeroValido(ia_voice_id) ||
    !Number.isInteger(Number(ia_voice_id)) ||
    Number(ia_voice_id) <= 0
  ) {
    return "Voz inválida";
  }

  if (
    confianca_minima !== undefined &&
    (!numeroValido(confianca_minima) ||
      Number(confianca_minima) < 0 ||
      Number(confianca_minima) > 1)
  ) {
    return "A confiança mínima deve estar entre 0 e 1";
  }

  if (
    tempo_maximo !== undefined &&
    (!numeroValido(tempo_maximo) ||
      !Number.isInteger(Number(tempo_maximo)) ||
      Number(tempo_maximo) < 1)
  ) {
    return "O tempo máximo deve ser um inteiro positivo";
  }

  if (
    silencio_apos_fala !== undefined &&
    (!numeroValido(silencio_apos_fala) || Number(silencio_apos_fala) < 0)
  ) {
    return "O silêncio após a fala deve ser um número não negativo";
  }

  if (ativa !== undefined && ![true, false, 0, 1].includes(ativa)) {
    return "O campo ativa deve ser booleano";
  }

  return null;
}

function validarVoz(body) {
  const { nome, voice_id, ia_model_id } = body;

  if (typeof nome !== "string" || !nome.trim() || nome.trim().length > 100) {
    return "O nome da voz é obrigatório e deve ter até 100 caracteres";
  }

  if (typeof voice_id !== "string" || !voice_id.trim() || voice_id.trim().length > 100) {
    return "O identificador da voz é obrigatório e deve ter até 100 caracteres";
  }

  if (
    !numeroValido(ia_model_id) ||
    !Number.isInteger(Number(ia_model_id)) ||
    Number(ia_model_id) <= 0
  ) {
    return "Modelo de voz inválido";
  }

  return null;
}

module.exports = {
  validarConfiguracaoIA,
  validarVozDoTenant,
  validarModelo,
  numeroValido,
  validarVoz,
};
