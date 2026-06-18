import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  PhoneCall,
  Building2,
  Server,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-role";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  adminOnly?: boolean;
}

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Building2 },
  { to: "/servidor", label: "Servidor", icon: Server, adminOnly: true },
];

const adminNav: NavItem[] = [
  { to: "/admin/usuarios", label: "Usuários", icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useIsAdmin();

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const visibleNav = nav.filter((item) => !item.adminOnly || isAdmin);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen bg-muted/20">
        <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
          <div className="flex items-center gap-2 px-4 py-4 border-b">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <PhoneCall className="h-4 w-4" />
            </div>
            <span className="font-semibold">Painel PABX</span>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <div className="pt-4">
                <p className="px-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Administração
                </p>
                {adminNav.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/70 hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          <div className="border-t p-3">
            <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
