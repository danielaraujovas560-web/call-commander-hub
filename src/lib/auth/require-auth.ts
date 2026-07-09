import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import jwt from "jsonwebtoken";

// Substitui requireSupabaseAuth. Verifica o JWT localmente (mesma JWT_SECRET
// compartilhada com o pabx-agent) — sem chamada de rede extra.
export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error(
        "JWT_SECRET não configurada no servidor do frontend. Defina a mesma JWT_SECRET usada no pabx-agent.",
      );
    }

    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }
    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new Error("Unauthorized: Invalid token");
    }
    if (!payload.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    return next({
      context: {
        userId: payload.sub as string,
        role: (payload.role as "admin" | "cliente") ?? "cliente",
        // Repassado como Bearer nas chamadas ao pabx-agent que dependem de
        // identidade (tenant/resolve, admin/*, clientes) — ver agent.server.ts.
        token,
      },
    });
  },
);
