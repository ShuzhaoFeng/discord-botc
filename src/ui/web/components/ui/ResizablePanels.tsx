"use client";

import * as React from "react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from "react-resizable-panels";

export { Panel };

/** Wraps Group; takes `direction` for backward compatibility, maps to `orientation`. */
interface PanelGroupProps extends Omit<GroupProps, "orientation"> {
  direction?: "horizontal" | "vertical";
}

export function PanelGroup({
  direction = "horizontal",
  ...props
}: PanelGroupProps) {
  return <Group orientation={direction} {...props} />;
}

interface PanelResizeHandleProps extends SeparatorProps {
  /** Orientation of the parent PanelGroup; controls handle geometry. */
  direction?: "horizontal" | "vertical";
}

/** Draggable resize handle, rendered as a thin gold strip with a ⠿ grip. */
export function PanelResizeHandle({
  className = "",
  direction = "horizontal",
  ...props
}: PanelResizeHandleProps) {
  const isHorizontal = direction === "horizontal";
  return (
    <Separator
      className={`group relative shrink-0 bg-gold/30 hover:bg-ember/70 transition-colors ${
        isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      } ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ember/0 group-hover:text-ember text-base leading-none select-none transition-colors ${
          isHorizontal ? "" : "rotate-90"
        }`}
      >
        ⠿
      </span>
    </Separator>
  );
}
