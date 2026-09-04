import { Badge } from "@/components/ui/badge";

export function ToggleAtivoBadge({
  ativo,
  onToggle,
  isPending = false,
}: {
  ativo: boolean;
  onToggle: () => void;
  isPending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className="cursor-pointer disabled:opacity-50"
    >
      <Badge variant={ativo ? "default" : "secondary"}>
         {ativo ? "Ativo" : "Inativo"}
      </Badge>
    </button>
  );
}
