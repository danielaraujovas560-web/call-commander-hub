import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecordingState = "enabled" | "disabled";

export function recordingFromState(state?: number | boolean | string | null): RecordingState {
  if (
    state === 1 ||
    state === true ||
    state === "1" ||
    String(state).toLowerCase() === "true"
  ) {
    return "enabled";
  }

  return "disabled";
}

export function RecordingBadge({
  state,
  size = 16,
  showLabel = false,
  className,
}: {
  state?: number | boolean | string | null;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const s = recordingFromState(state);

  const label = s === "enabled" ? "Ativa" : "Desativada";
  const Icon = s === "enabled" ? Mic : MicOff;
  const color =
    s === "enabled"
      ? "text-emerald-500"
      : "text-muted-foreground";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={`Gravação ${label.toLowerCase()}`}
    >
      <Icon className={color} style={{ width: size, height: size }} />
      {showLabel && label}
    </span>
  );
}
