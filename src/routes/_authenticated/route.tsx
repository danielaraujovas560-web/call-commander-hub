import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { whoAmI } from "@/lib/auth/whoami.functions";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const user = await whoAmI();
      return { user };
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
