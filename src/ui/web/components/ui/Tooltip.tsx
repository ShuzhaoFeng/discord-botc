"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export const TooltipProvider = RadixTooltip.Provider;
export const TooltipRoot = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof RadixTooltip.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className = "", sideOffset = 6, children, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`parchment z-50 px-2 py-1 rounded text-xs font-medium text-[#2a1f12] shadow-lg select-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 ${className}`}
      {...props}
    >
      {children}
      <RadixTooltip.Arrow className="fill-[var(--color-parchment)]" />
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";

/** Convenience wrapper: <Tooltip content="…">{trigger}</Tooltip>. */
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  asChild?: boolean;
  delayDuration?: number;
}

export function Tooltip({
  content,
  children,
  side = "top",
  asChild = true,
  delayDuration = 200,
}: TooltipProps) {
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}
