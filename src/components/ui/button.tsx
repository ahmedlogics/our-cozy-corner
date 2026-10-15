import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-[#066B63] transition-all",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-foreground hover:bg-secondary/60 hover:border-primary/40 shadow-xs",
        secondary: "border border-border/70 bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary/70 text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "bg-[#087F75] text-white hover:bg-[#066B63] font-bold shadow-md hover:shadow-lg shadow-[#087F75]/20 hover:-translate-y-0.5 transition-all duration-200",
        navy: "bg-[#14283F] text-white hover:bg-[#1D3654] font-bold shadow-md hover:-translate-y-0.5 transition-all duration-200",
        glass: "border border-border bg-white/90 backdrop-blur-md text-foreground hover:border-[#087F75]/50 hover:bg-white shadow-soft transition-all",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-11 px-6 text-sm rounded-xl",
        xl: "h-12 px-7 text-base rounded-xl font-bold",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
