import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const notaColors: Record<number, string> = {
  1: "bg-[#EF4444] text-white hover:bg-[#EF4444]/90 border-transparent",
  2: "bg-[#F97316] text-white hover:bg-[#F97316]/90 border-transparent",
  3: "bg-[#EAB308] text-black hover:bg-[#EAB308]/90 border-transparent",
  4: "bg-[#84CC16] text-black hover:bg-[#84CC16]/90 border-transparent",
  5: "bg-[#22C55E] text-white hover:bg-[#22C55E]/90 border-transparent",
};

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
