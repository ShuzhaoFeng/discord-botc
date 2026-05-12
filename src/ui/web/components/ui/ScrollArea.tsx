"use client";

import * as React from "react";
import * as RadixScrollArea from "@radix-ui/react-scroll-area";

interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof RadixScrollArea.Root> {
  /** Class applied to the inner Viewport (where overflow happens). */
  viewportClassName?: string;
  /** Orientation of the scrollbar. Defaults to vertical. */
  orientation?: "vertical" | "horizontal" | "both";
}

export const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof RadixScrollArea.Root>,
  ScrollAreaProps
>(
  (
    {
      className = "",
      viewportClassName = "",
      children,
      orientation = "vertical",
      ...props
    },
    ref,
  ) => (
    <RadixScrollArea.Root
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      <RadixScrollArea.Viewport
        /* Radix wraps children in an inner div with `display: table` and
           `min-width: 100%`, which sizes the wrapper to content's natural
           width. For vertical-only scroll we override it back to block-level,
           full-width so children respect the container width (and CSS
           `truncate` actually causes shrinking). For horizontal scroll keep
           Radix's behaviour. */
        className={`h-full w-full ${
          orientation === "vertical"
            ? "[&>div]:!block [&>div]:!w-full"
            : ""
        } ${viewportClassName}`}
      >
        {children}
      </RadixScrollArea.Viewport>
      {(orientation === "vertical" || orientation === "both") && (
        <RadixScrollArea.Scrollbar
          orientation="vertical"
          className="flex touch-none select-none p-0.5 bg-transparent transition-colors hover:bg-ink-2/40 w-2.5"
        >
          <RadixScrollArea.Thumb className="relative flex-1 rounded-full bg-gold/40 hover:bg-gold/70 transition-colors before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:h-full before:w-full before:min-w-[44px] before:min-h-[44px] before:content-['']" />
        </RadixScrollArea.Scrollbar>
      )}
      {(orientation === "horizontal" || orientation === "both") && (
        <RadixScrollArea.Scrollbar
          orientation="horizontal"
          className="flex touch-none select-none p-0.5 bg-transparent transition-colors hover:bg-ink-2/40 h-2.5 flex-col"
        >
          <RadixScrollArea.Thumb className="relative flex-1 rounded-full bg-gold/40 hover:bg-gold/70 transition-colors" />
        </RadixScrollArea.Scrollbar>
      )}
      <RadixScrollArea.Corner className="bg-transparent" />
    </RadixScrollArea.Root>
  ),
);
ScrollArea.displayName = "ScrollArea";
