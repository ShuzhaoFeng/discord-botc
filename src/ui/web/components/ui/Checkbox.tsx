"use client";

import * as React from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof RadixCheckbox.Root>,
  React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root>
>(({ className = "", ...props }, ref) => (
  <RadixCheckbox.Root
    ref={ref}
    className={`peer w-4 h-4 shrink-0 rounded-sm border border-gold/60 bg-ink-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 data-[state=checked]:bg-ember data-[state=checked]:border-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    {...props}
  >
    <RadixCheckbox.Indicator className="flex items-center justify-center text-[#1a1410]">
      <Check size={12} strokeWidth={3} />
    </RadixCheckbox.Indicator>
  </RadixCheckbox.Root>
));
Checkbox.displayName = "Checkbox";
