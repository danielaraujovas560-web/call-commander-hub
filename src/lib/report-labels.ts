export const statusOptions = [
  { value: "ANSWER", label: "Atendida" },
  { value: "NO ANSWER", label: "Não Atendida" },
  { value: "BUSY", label: "Ocupado" },
  { value: "CANCEL", label: "Cancelada" },
  { value: "CHANUNAVAIL", label: "Canal Indisponível" },
  { value: "CONGESTION", label: "Congestionamento" },
  { value: "FAILED", label: "Falhou" },
  { value: "INVALIDARGS", label: "Argumento Inválido" },
] as const;

export const eventOptions = [
  { value: "ATENDEU", label: "Atendida" },
  { value: "NAO_ATENDEU", label: "Não Atendida" },
] as const;

export const reasonOptions = [
  { value: "OUTRO_AGENTE_ATENDEU", label: "Atendido por outro agente" },
  { value: "RAMAL_DESLIGADO", label: "Agente desligado" },
  { value: "CLIENTE_DESLIGOU", label: "Desligado pelo cliente" },
  { value: "AGENTE_DESLIGOU", label: "Desligado pelo agente" },
  { value: "OCUPADO", label: "Agente Ocupado" },
] as const;

export function getStatusLabel(status: string) {
  return statusOptions.find(s => s.value === status)?.label ?? status;
}

export const getEventLabel = (value: string) =>
  eventOptions.find(o => o.value === value)?.label ?? value;

export const getReasonLabel = (value: string) =>
  reasonOptions.find(o => o.value === value)?.label ?? value;
