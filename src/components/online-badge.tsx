import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type OnlineState = "online" | "offline" | "unknown";

export function statusFromState(state?: string | null): OnlineState {
  const s = String(state || "").trim().toUpperCase();
  if (!s || s === "UNKNOWN") return "unknown";
  if (s === "UNAVAILABLE") return "offline";
  return "online";
}

export function OnlineBadge({
  state,
  size = 16,
  showLabel = false,
  className,
}: {
  state?: string | null;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const s = statusFromState(state);
  const label = s === "online" ? "Online" : s === "offline" ? "Offline" : "—";
  const raw = state && s !== "unknown" ? state : undefined;

  const Icon = s === "online" ? CheckCircle2 : s === "offline" ? XCircle : HelpCircle;
  const color =
    s === "online" ? "text-emerald-500" : s === "offline" ? "text-red-500" : "text-muted-foreground";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={raw ? `${label} (${raw})` : label}
    >
      <Icon className={color} style={{ width: size, height: size }} />
      {showLabel && <span className="text-xs">{label}</span>}
    </span>
  );
}
