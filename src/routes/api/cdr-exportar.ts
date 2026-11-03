import { createFileRoute } from "@tanstack/react-router";
import { readExportTicket } from "@/lib/cdr-export-ticket.server";
import { resolveTenantId } from "@/lib/tenant.server";
import { agentDownload } from "@/lib/agent.server";

export const Route = createFileRoute("/api/cdr-exportar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const ticket = url.searchParams.get("ticket") || "";
          const payload = readExportTicket(ticket);
          const verifiedTenant = await resolveTenantId(payload.token, payload.tenantId);
          if (verifiedTenant !== payload.tenantId)
            return Response.json({ error: "Tenant não autorizado" }, { status: 403 });
          const params = new URLSearchParams(payload.filters);
          params.set("formato", payload.formato);
          params.set("jobId", payload.jobId);
          const upstream = await agentDownload(
            `/cdr/exportar/${payload.tipo}?${params.toString()}`,
            {
              tenantId: payload.tenantId,
              bearerToken: payload.token,
              timeoutMs: 120000,
            },
          );
          // O fluxo do arquivo é repassado, sem buffer no servidor web.
          const headers = new Headers();
          for (const name of ["content-type", "content-disposition"]) {
            const value = upstream.headers.get(name);
            if (value) headers.set(name, value);
          }

          const extension = payload.formato === "csv" ? "csv" : "xlsx";

          if (!headers.has("Content-Type")) {
            headers.set(
              "Content-Type",
              extension === "csv"
                ? "text/csv; charset=utf-8"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            );
          }

          if (!headers.has("Content-Disposition")) {
            headers.set("Content-Disposition", `attachment; filename="cdr_geral.${extension}"`);
          }

          headers.set("Cache-Control", "no-store");
          headers.set("X-Content-Type-Options", "nosniff");
          return new Response(upstream.body, { status: upstream.status, headers });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Falha ao exportar" },
            { status: 400 },
          );
        }
      },
    },
  },
});
