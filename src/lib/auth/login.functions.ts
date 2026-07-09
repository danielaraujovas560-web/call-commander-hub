import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LoginInput = z.object({
  email: z.string().trim().email().max(255),
  senha: z.string().min(1).max(72),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LoginInput.parse(d))
  .handler(async ({ data }) => {
    const { agentFetch } = await import("../agent.server");
    const res = await agentFetch<{
      token: string;
      user: { id: string; nome: string; email: string; role: "admin" | "cliente" };
    }>("/auth/login", { method: "POST", body: { email: data.email, senha: data.senha } });
    return res;
  });
