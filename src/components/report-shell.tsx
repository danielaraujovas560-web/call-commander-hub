import type { ReactNode } from "react";

export function ReportShell({
  loading, error, empty, children,
}: { loading?: boolean; error?: Error | null; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;
  if (error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </div>
    );
  if (empty) return <div className="text-sm text-muted-foreground py-6 text-center">Sem registros.</div>;
  return <>{children}</>;
}
