"use client";

import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof RadixSwitch.Root>,
  React.ComponentPropsWithoutRef<typeof RadixSwitch.Root>
>(({ className = "", ...props }, ref) => (
  <RadixSwitch.Root
    ref={ref}
    className={`peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-gold/40 bg-ink-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 data-[state=checked]:bg-ember/60 data-[state=checked]:border-gold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    <RadixSwitch.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-parchment shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
  </RadixSwitch.Root>
));
Switch.displayName = "Switch";
