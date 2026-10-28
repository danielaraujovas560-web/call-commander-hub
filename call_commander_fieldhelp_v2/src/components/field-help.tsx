import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Ícone de ajuda reutilizável ao lado de Labels.
 * - Abre imediatamente no hover ou foco de teclado.
 * - Espera 150ms antes de fechar para evitar o efeito de piscar.
 * - Mantém o conteúdo acessível enquanto o ponteiro passa do ícone para o tooltip.
 * - Cancela timers ao desmontar, evitando atualizações após unmount.
 */
export function FieldHelp({ text, children }: { text?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const hideSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 150);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text ? `Ajuda: ${text}` : "Ajuda sobre o campo"}
            className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            onFocus={show}
            onBlur={hideSoon}
            onClick={() => setOpen((current) => !current)}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-xs text-xs leading-relaxed"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
        >
          {text ?? children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldHelp;
