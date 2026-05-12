"use client";

import { useState } from "react";
import type { PlayerAssignment, RoleInfo } from "@/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea";

const CATEGORY_TINT: Record<string, string> = {
  Townsfolk: "var(--color-townsfolk)",
  Outsider: "var(--color-outsider)",
  Minion: "var(--color-minion)",
  Demon: "var(--color-demon)",
};

const CATEGORY_ORDER = ["Townsfolk", "Outsider", "Minion", "Demon"] as const;

interface Props {
  assignments: PlayerAssignment[];
  allRoles: RoleInfo[];
  onSwap: (userId1: string, userId2: string) => void;
  onRoleChange: (userId: string, roleId: string) => void;
}

export default function PlayerTable({
  assignments,
  allRoles,
  onSwap,
  onRoleChange,
}: Props) {
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center pl-3 pr-4 py-2.5 border-b border-gold/30 text-xs uppercase tracking-[0.18em] text-parchment-2/70 font-display">
        {/* Token column has no header label; it's purely visual. */}
        <span className="w-11 shrink-0" aria-hidden="true" />
        <span className="w-12 shrink-0">Seat</span>
        <span className="flex-1 min-w-0">Player</span>
        <span className="w-64 shrink-0">Role</span>
      </div>

      <ScrollArea className="flex-1">
        {assignments.map((row) => {
          const isSource = dragSourceId === row.userId;
          const isOver = dragOverId === row.userId;
          const tint = CATEGORY_TINT[row.role.category] ?? "var(--color-gold)";
          return (
            <div
              key={row.userId}
              style={{ borderLeft: `3px solid ${tint}` }}
              className={[
                "parchment-row flex items-center pl-3 pr-4 py-3 border-b border-gold/15 transition-colors select-none",
                isOver
                  ? "outline outline-1 outline-dashed outline-ember/80"
                  : "",
              ].join(" ")}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragSourceId && dragSourceId !== row.userId) {
                  setDragOverId(row.userId);
                }
              }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverId(null);
                if (dragSourceId && dragSourceId !== row.userId) {
                  onSwap(dragSourceId, row.userId);
                }
              }}
            >
              <span className="w-11 shrink-0 flex items-center">
                <Tooltip content={`${row.role.name} (${row.role.category})`}>
                  <span
                    className="token-disc"
                    style={{ ["--token-tint" as string]: tint }}
                    aria-label={`${row.role.name} (${row.role.category})`}
                  />
                </Tooltip>
              </span>

              <span className="w-12 shrink-0">
                <span className="bg-ink-2 text-parchment-2 border border-gold/30 rounded px-1.5 py-0.5 text-xs font-mono">
                  {row.seatIndex + 1}
                </span>
              </span>

              <span className="flex-1 min-w-0 font-medium text-sm truncate pr-4 text-parchment">
                {row.displayName}
              </span>

              {/* Drag-to-swap is scoped to this cell: the ⠿ handle starts
                  the drag, setDragImage uses the whole cell as the floating
                  preview, and only this cell dims while it's the source.
                  Drop handlers live on the row so any part of a target row
                  accepts the drop. */}
              <div
                data-role-cell
                className={`w-64 shrink-0 flex items-center gap-2 transition-opacity ${
                  isSource ? "opacity-40" : ""
                }`}
              >
                <Tooltip content="Drag to swap roles">
                  <span
                    draggable
                    onDragStart={(e) => {
                      const cell = e.currentTarget.closest(
                        "[data-role-cell]",
                      ) as HTMLElement | null;
                      if (cell) {
                        e.dataTransfer.setDragImage(
                          cell,
                          cell.offsetWidth / 2,
                          cell.offsetHeight / 2,
                        );
                      }
                      e.dataTransfer.effectAllowed = "move";
                      setDragSourceId(row.userId);
                    }}
                    onDragEnd={() => {
                      setDragSourceId(null);
                      setDragOverId(null);
                    }}
                    className="text-parchment-2/50 hover:text-ember cursor-grab active:cursor-grabbing leading-none text-base transition-colors"
                    aria-label="Drag to swap roles"
                  >
                    ⠿
                  </span>
                </Tooltip>
                <Select
                  value={row.role.id}
                  onValueChange={(v) => onRoleChange(row.userId, v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ORDER.map((cat) => {
                      const rolesInCat = allRoles.filter(
                        (r) => r.category === cat,
                      );
                      if (rolesInCat.length === 0) return null;
                      return (
                        <SelectGroup key={cat}>
                          <SelectLabel>{cat}</SelectLabel>
                          {rolesInCat.map((r) => (
                            <SelectItem
                              key={`${cat}:${r.id}`}
                              value={r.id}
                              tint={CATEGORY_TINT[cat]}
                            >
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
