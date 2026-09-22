import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatarDataHora(dataStr?: string | null): string {
  if (!dataStr) return "-";

  const [data, hora] = dataStr.split(" ");
  if (!data || !hora) return dataStr;

  const [ano, mes, dia] = data.split("-");

  return `${dia}/${mes}/${ano} ${hora}`;
}

export function formatarHorario(dataStr?: string | null): string {
  if (!dataStr) return "-";

  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return dataStr;

  const formatado = data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatado.replace(",", " -");
}
