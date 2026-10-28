import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FieldHelp({ text, children }: { text?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    const id = setTimeout(() => {
      setOpen(false);
    }, 150);
    setTimeoutId(id);
  };

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text ? `Ajuda: ${text}` : "Ajuda sobre o campo"}
            className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={(e) => e.preventDefault()}
            onClick={() => setOpen((current) => !current)}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
          {text ?? children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldHelp;
