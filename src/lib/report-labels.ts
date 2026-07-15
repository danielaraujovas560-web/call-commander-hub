export const statusOptions = [
  { value: "ANSWER", label: "Atendida" },
  { value: "NOANSWER", label: "Não Atendida" },
  { value: "BUSY", label: "Ocupado" },
  { value: "CANCEL", label: "Cancelada" },
  { value: "CHANUNAVAIL", label: "Canal Indisponível" },
  { value: "CONGESTION", label: "Congestionamento" },
  { value: "FAILED", label: "Falhou" },
  { value: "INVALIDARGS", label: "Argumento Inválido" },
] as const;

export const eventOptions = [
  { value: "AGENTE_ATENDEU", label: "Atendida" },
  { value: "AGENTE_NAO_ATENDEU", label: "Não atendida" },
  { value: "AGENTE_TIMEOUT", label: "Timeout" },
  { value: "AGENTE_RECUSOU", label: "Recusada" },
  { value: "AGENTE_OCUPADO", label: "Ocupado" },
] as const;

export const reasonOptions = [
  { value: "OUTRO_ATENDEU", label: "Atendido por outro agente" },
  { value: "ATENDIDA_AGENTE", label: "Atendida pelo agente" },
  { value: "CHAMOU_MAX", label: "Agente não atendeu no tempo da fila" },
  { value: "RECUSOU_CHAMADA", label: "Agente recusou a chamada na fila" },
  { value: "OCUPADO", label: "Agente Ocupado" },
] as const;

export function getStatusLabel(status: string) {
  return statusOptions.find(s => s.value === status)?.label ?? status;
}

export const getEventLabel = (value: string) =>
  eventOptions.find(o => o.value === value)?.label ?? value;

export const getReasonLabel = (value: string) =>
  reasonOptions.find(o => o.value === value)?.label ?? value;
