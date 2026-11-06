"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DialogContent as BaseDialogContent,
  DialogHeader as BaseDialogHeader,
  DialogFooter as BaseDialogFooter,
} from "@/components/ui/dialog";

/**
 * Padrão visual único dos formulários do painel:
 * - cabeçalho com ícone;
 * - UM card interno envolvendo todos os campos;
 * - área central rolável;
 * - ações fora da rolagem, no rodapé.
 *
 * Não modifica os handlers, valores, validações ou campos de cada rota.
 */
export const ManagementDialogHeader = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <BaseDialogHeader
    className={cn("shrink-0 border-b bg-muted/20 px-6 py-5 pr-12 text-left", className)}
    {...props}
  >
    <div className="flex items-start gap-3 text-left">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
        <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  </BaseDialogHeader>
);
ManagementDialogHeader.displayName = "ManagementDialogHeader";

export const ManagementDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <BaseDialogFooter
    className={cn(
      "flex flex-row flex-wrap items-center justify-end gap-2 sm:space-x-0",
      className,
    )}
    {...props}
  />
);
ManagementDialogFooter.displayName = "ManagementDialogFooter";

const SCROLL_CLASS = "min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5";
const CARD_CLASS = cn(
  "min-w-0 space-y-4 rounded-xl border border-border/75 bg-muted/10 p-4 shadow-sm sm:p-5",
  // Tipografia e dimensões: não criam cards separados para cada linha/campo.
  "[&_input:not([type=checkbox])]:min-h-9",
  "[&_textarea]:min-h-24",
  "[&_label]:text-sm",
  "[&_label]:font-medium",
);
const FOOTER_WRAP_CLASS = "shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4";

type FormProps = React.ComponentPropsWithoutRef<"form">;

function isManagementFooter(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ManagementDialogFooter;
}

function isManagementHeader(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ManagementDialogHeader;
}

function wrapFooter(footer: React.ReactNode) {
  return footer ? <div className={FOOTER_WRAP_CLASS}>{footer}</div> : null;
}

/**
 * A composição usa a estrutura real das rotas, que já importam os aliases
 * DialogHeader/DialogContent/DialogFooter deste arquivo.
 *
 * Quando a rota possui <form> diretamente no modal, o formulário continua
 * sendo o mesmo elemento (inclusive seu onSubmit); apenas os filhos visuais
 * são distribuídos entre o card rolável e o rodapé fixo.
 */
export const ManagementDialogContent = React.forwardRef<
  React.ElementRef<typeof BaseDialogContent>,
  React.ComponentPropsWithoutRef<typeof BaseDialogContent>
>(({ children, className, ...props }, ref) => {
  const nodes = React.Children.toArray(children);
  const headerIndex = nodes.findIndex(isManagementHeader);
  const directFooterIndex = nodes.findIndex(isManagementFooter);
  const header = headerIndex >= 0 ? nodes[headerIndex] : null;
  const directFooter = directFooterIndex >= 0 ? nodes[directFooterIndex] : null;
  const body = nodes.filter((_, i) => i !== headerIndex && i !== directFooterIndex);

  const directForm =
    body.length === 1 &&
    React.isValidElement<FormProps>(body[0]) &&
    body[0].type === "form"
      ? (body[0] as React.ReactElement<FormProps>)
      : null;

  let content: React.ReactNode;

  if (directForm) {
    const formChildren = React.Children.toArray(directForm.props.children);
    const nestedFooterIndex = formChildren.findIndex(isManagementFooter);
    const nestedFooter = nestedFooterIndex >= 0 ? formChildren[nestedFooterIndex] : null;
    const fields = formChildren.filter((_, index) => index !== nestedFooterIndex);

    content = React.cloneElement(
      directForm,
      {
        className: cn(
          directForm.props.className,
          // Remove rolagem/spacing antigos do form; agora apenas o centro rola.
          "flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden p-0 pr-0 space-y-0",
        ),
      },
      <div className={SCROLL_CLASS}>
        <div className={CARD_CLASS}>{fields}</div>
      </div>,
      wrapFooter(nestedFooter),
    );
  } else {
    content = (
      <>
        <div className={SCROLL_CLASS}>
          <div className={CARD_CLASS}>{body}</div>
        </div>
        {wrapFooter(directFooter)}
      </>
    );
  }

  return (
    <BaseDialogContent
      ref={ref}
      className={cn(
        className,
        "flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 shadow-xl sm:max-w-3xl",
      )}
      {...props}
    >
      {header}
      {content}
    </BaseDialogContent>
  );
});
ManagementDialogContent.displayName = "ManagementDialogContent";
