import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function ComingSoonPage({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        {icon} {title}
      </h1>
      <div className="rounded-md border bg-card p-10 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <Badge variant="secondary" className="mt-3">
          Em breve
        </Badge>
      </div>
    </div>
  );
}
