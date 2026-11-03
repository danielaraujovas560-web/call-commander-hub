import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

export type ExportPayload = {
  token: string;
  tenantId: number;
  formato: "csv" | "xlsx";
  tipo: "geral" | "fila" | "ura" | "ura-ia" | "ddd" | "satisfacao";
  jobId: string;
  filters: Record<string, string>;
  expiresAt: number;
};

function key() {
  const secret = process.env.CDR_EXPORT_TICKET_SECRET || process.env.PABX_AGENT_SECRET;
  if (!secret || secret.length < 24)
    throw new Error("Configure CDR_EXPORT_TICKET_SECRET (mínimo 24 caracteres)");
  return createHash("sha256").update(secret).digest();
}

export function createExportTicket(payload: ExportPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readExportTicket(ticket: string): ExportPayload {
  if (ticket.length > 10000) throw new Error("Ticket inválido");
  const bytes = Buffer.from(ticket, "base64url");
  if (bytes.length < 29) throw new Error("Ticket inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const payload = JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
  ) as ExportPayload;
  if (!payload.expiresAt || Date.now() > payload.expiresAt) throw new Error("Ticket expirado");
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não configurada");
  jwt.verify(payload.token, process.env.JWT_SECRET);
  if (
    !Number.isSafeInteger(payload.tenantId) ||
    payload.tenantId <= 0 ||
    !/^[0-9a-f-]{36}$/i.test(payload.jobId)
  )
    throw new Error("Ticket inválido");
  if (!["csv", "xlsx"].includes(payload.formato)) throw new Error("Ticket inválido");
  return payload;
}
