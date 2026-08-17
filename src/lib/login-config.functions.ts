import { createServerFn } from "@tanstack/react-start";

export const getSipConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { agentFetch } = await import("./agent.server");
  return await agentFetch<{ host: string; port: string }>("/config/sip");
});
