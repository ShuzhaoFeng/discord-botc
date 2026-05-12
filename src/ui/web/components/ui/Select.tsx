"use client";

import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;
export const SelectGroup = RadixSelect.Group;

interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger> {
  size?: "sm" | "md";
}

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Trigger>,
  SelectTriggerProps
>(({ className = "", size = "md", children, ...props }, ref) => {
  const sizeClass =
    size === "sm" ? "text-xs px-2 py-1" : "text-sm px-2 py-1.5";
  return (
    <RadixSelect.Trigger
      ref={ref}
      className={`inline-flex items-center justify-between gap-2 w-full bg-ink-2 border border-gold/40 rounded text-parchment cursor-pointer focus:outline-none focus:border-ember data-[state=open]:border-ember transition-colors ${sizeClass} ${className}`}
      {...props}
    >
      <span className="truncate text-left flex-1 min-w-0">{children}</span>
      <RadixSelect.Icon asChild>
        <ChevronDown
          size={size === "sm" ? 12 : 14}
          className="shrink-0 text-parchment-2/60"
        />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
});
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Content>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(({ className = "", children, position = "popper", ...props }, ref) => (
  <RadixSelect.Portal>
    <RadixSelect.Content
      ref={ref}
      position={position}
      sideOffset={4}
      /* Height is bounded by the actual space Radix found via collision
         detection (--radix-select-content-available-height). Width tracks the
         trigger. The Viewport handles vertical overflow via Radix's
         ScrollUp/ScrollDown buttons — no native scrollbar required. */
      className={`parchment z-50 overflow-hidden rounded-md min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] text-sm shadow-2xl ${className}`}
      {...props}
    >
      <RadixSelect.ScrollUpButton className="flex items-center justify-center py-1 text-[#2a1f12]/60 cursor-default bg-parchment-2/60">
        <ChevronUp size={14} />
      </RadixSelect.ScrollUpButton>
      <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
      <RadixSelect.ScrollDownButton className="flex items-center justify-center py-1 text-[#2a1f12]/60 cursor-default bg-parchment-2/60">
        <ChevronDown size={14} />
      </RadixSelect.ScrollDownButton>
    </RadixSelect.Content>
  </RadixSelect.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Label>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Label>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.Label
    ref={ref}
    className={`font-display tracking-[0.12em] uppercase text-[10px] text-[#6a5238] px-2 pt-2 pb-1 ${className}`}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";

interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof RadixSelect.Item> {
  /** Optional tint color for a leading dot (faction CSS var). */
  tint?: string;
}

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Item>,
  SelectItemProps
>(({ className = "", children, tint, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={`relative flex items-center gap-2 select-none rounded-sm pl-2 pr-7 py-1.5 text-[#2a1f12] outline-none cursor-pointer data-[highlighted]:bg-ember/30 data-[highlighted]:text-[#1a1410] data-[state=checked]:font-semibold data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed ${className}`}
    {...props}
  >
    {tint && (
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full shrink-0 ring-1 ring-[#2a1f12]/30"
        style={{ backgroundColor: tint }}
      />
    )}
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    <RadixSelect.ItemIndicator className="absolute right-2 inline-flex items-center justify-center">
      <Check size={14} />
    </RadixSelect.ItemIndicator>
  </RadixSelect.Item>
));
SelectItem.displayName = "SelectItem";

export const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Separator>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.Separator
    ref={ref}
    className={`my-1 h-px bg-[#2a1f12]/15 ${className}`}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";
