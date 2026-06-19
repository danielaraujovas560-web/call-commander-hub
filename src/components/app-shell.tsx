import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PhoneCall,
  Building2,
  Server,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Users,
  ArrowLeft,
  Workflow,
  ListOrdered,
  Music,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-role";
import { getClienteByTenant } from "@/lib/clientes.functions";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  adminOnly?: boolean;
  params?: Record<string, string>;
  exact?: boolean;
}

const mainNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Building2 },
  { to: "/servidor", label: "Servidor", icon: Server, adminOnly: true },
];

const adminNav: NavItem[] = [
  { to: "/admin/usuarios", label: "Usuários", icon: ShieldCheck },
];

function matchClienteRoute(pathname: string): string | null {
  const m = pathname.match(/^\/clientes\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useIsAdmin();

  const clienteTenant = matchClienteRoute(pathname);

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen bg-muted/20">
        {clienteTenant ? (
          <ClienteSidebar tenantId={Number(clienteTenant)} pathname={pathname} onLogout={handleLogout} />
        ) : (
          <MainSidebar
            pathname={pathname}
            isAdmin={isAdmin}
            onLogout={handleLogout}
          />
        )}

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}

// ---------- main sidebar ----------
function MainSidebar({
  pathname,
  isAdmin,
  onLogout,
}: {
  pathname: string;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const visibleNav = mainNav.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
          <PhoneCall className="h-4 w-4" />
        </div>
        <span className="font-semibold">Painel PABX</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {visibleNav.map((item) => (
          <NavLink key={item.to} item={item} pathname={pathname} />
        ))}

        {isAdmin && (
          <div className="pt-4">
            <p className="px-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Administração
            </p>
            {adminNav.map((item) => (
              <NavLink key={item.to} item={item} pathname={pathname} />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}

// ---------- cliente-scoped sidebar ----------
function ClienteSidebar({
  tenantId,
  pathname,
  onLogout,
}: {
  tenantId: number;
  pathname: string;
  onLogout: () => void;
}) {
  const fn = useServerFn(getClienteByTenant);
  const { data } = useQuery({
    queryKey: ["cliente", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
    retry: false,
  });
  const cliente = data?.cliente;

  const items = [
    { to: "/clientes/$tenantId", label: "Visão geral", icon: LayoutDashboard, exact: true },
    { to: "/clientes/$tenantId/ramais", label: "Ramais", icon: PhoneCall },
    { to: "/clientes/$tenantId/filas", label: "Filas", icon: ListOrdered },
    { to: "/clientes/$tenantId/uras", label: "URAs", icon: Workflow },
    { to: "/clientes/$tenantId/audios", label: "Áudios", icon: Music },
    { to: "/clientes/$tenantId/relatorios", label: "Relatórios", icon: BarChart3 },
  ] as const;
  const params = { tenantId: String(tenantId) };


  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex flex-col gap-1 px-4 py-4 border-b">
        <Link
          to="/clientes"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Clientes
        </Link>
        <div className="font-semibold text-sm truncate" title={cliente?.razao_social ?? ""}>
          {cliente?.razao_social ?? "Carregando…"}
        </div>
        <Badge variant="outline" className="font-mono text-[10px] w-fit">
          Tenant #{tenantId}
        </Badge>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const resolved = item.to.replace("$tenantId", String(tenantId));
          const active = item.exact
            ? pathname === resolved
            : pathname === resolved || pathname.startsWith(resolved + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              params={params}
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
      </nav>


      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  pathname,
  useHref,
}: {
  item: NavItem;
  pathname: string;
  useHref?: boolean;
}) {
  const Icon = item.icon;
  const active = item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
  const className = cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-foreground/70 hover:bg-accent hover:text-foreground",
  );

  if (useHref) {
    // dynamic cliente paths — use href to avoid typed-link friction
    return (
      <a href={item.to} className={className}>
        <Icon className="h-4 w-4" />
        {item.label}
      </a>
    );
  }

  return (
    <Link to={item.to} className={className}>
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
