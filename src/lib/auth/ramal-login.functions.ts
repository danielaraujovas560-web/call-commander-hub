import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RamalLoginInput = z.object({
  endpoint_id: z.string().trim().min(1).max(50),
  senha: z.string().min(1).max(72),
});

export const ramalLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RamalLoginInput.parse(d))
  .handler(async ({ data }) => {
    const { agentFetch } = await import("../agent.server");
    return await agentFetch<{
      ok: true;
      ramal: string;
      nome: string | null;
      sip_username: string;
      sip_password: string;
      tenant_id: number;
      wss_url: string;
      sip_domain: string;
    }>("/ramal-auth/login", {
      method: "POST",
      body: { endpoint_id: data.endpoint_id, senha: data.senha },
    });
  });
