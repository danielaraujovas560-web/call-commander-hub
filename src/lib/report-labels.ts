export const statusOptions = [
  { value: "ANSWER", label: "Atendida" },
  { value: "NOANSWER", label: "Não Atendida" },
  { value: "BUSY", label: "Ocupado" },
  { value: "CANCEL", label: "Cancelada" },
  { value: "CHANUNAVAIL", label: "Canal Indisponível" },
  { value: "CONGESTION", label: "Congestionamento" },
  { value: "FAILED", label: "Falhou" },
  { value: "INVALIDARGS", label: "Argumento Inválido" },
  { value: "FORBIDDEN(PERM)", label: "Proibido (Sem permissão)" },
  { value: "FORBIDDEN(BLACK)", label: "Proibido (Blacklist)" },
] as const;

export const eventOptions = [
  { value: "AGENTE_ATENDEU", label: "Atendida" },
  { value: "AGENTE_NAO_ATENDEU", label: "Não Atendida" },
  { value: "AGENTE_TIMEOUT", label: "Timeout Agente" },
  { value: "AGENTE_RECUSOU", label: "Recusada" },
  { value: "AGENTE_OCUPADO", label: "Ocupado" },
  { value: "TIMEOUT", label: "Timeout Fila" },
  { value: "CLIENTE_DESLIGOU", label: "Cliente Desligou" },
] as const;

export const reasonOptions = [
  { value: "OUTRO_ATENDEU", label: "Atendido por outro agente" },
  { value: "ATENDIDA_AGENTE", label: "Atendida pelo agente" },
  { value: "RECUSOU_CHAMADA", label: "Agente recusou a chamada na fila" },
  { value: "OCUPADO", label: "Agente Ocupado" },
  { value: "NINGUEM_ATENDEU_CLI", label: "Agente não atendeu" },
  { value: "NINGUEM_ATENDEU_FIL", label: "Agente não atendeu no tempo estabelecido" },
] as const;

export function getStatusLabel(status: string) {
  return statusOptions.find(s => s.value === status)?.label ?? status;
}

export const getEventLabel = (value: string) =>
  eventOptions.find(o => o.value === value)?.label ?? value;

export const getReasonLabel = (value: string) =>
  reasonOptions.find(o => o.value === value)?.label ?? value;
