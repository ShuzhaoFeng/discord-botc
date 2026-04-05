"use client";

import { useState } from "react";
import type { PlayerAssignment, RoleInfo } from "@/types";

const CATEGORY_STYLE: Record<string, string> = {
  Townsfolk: "bg-blue-900/40 text-blue-300 border border-blue-800",
  Outsider: "bg-cyan-900/40 text-cyan-300 border border-cyan-800",
  Minion: "bg-orange-900/40 text-orange-300 border border-orange-800",
  Demon: "bg-red-900/40 text-red-300 border border-red-800",
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
      {/* Column header */}
      <div className="shrink-0 flex items-center px-4 py-2.5 border-b border-slate-700 text-xs uppercase tracking-widest text-slate-500 font-medium">
        <span className="w-10 shrink-0">Seat</span>
        <span className="flex-1 min-w-0">Player</span>
        <span className="w-52 shrink-0 pl-6">Role</span>
        <span className="w-28 shrink-0 text-right pr-1">Category</span>
      </div>

      {/* Scrollable rows */}
      <div className="overflow-y-auto flex-1">
        {assignments.map((row) => {
          const isSource = dragSourceId === row.userId;
          const isOver = dragOverId === row.userId;
          return (
            <div
              key={row.userId}
              draggable
              className={[
                "flex items-center px-4 py-3 border-b border-slate-800 transition-colors select-none",
                isSource ? "opacity-40" : "",
                isOver
                  ? "bg-indigo-950/40 outline outline-1 outline-dashed outline-indigo-500"
                  : "hover:bg-slate-800/40",
              ].join(" ")}
              onDragStart={() => setDragSourceId(row.userId)}
              onDragEnd={() => {
                setDragSourceId(null);
                setDragOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragSourceId !== row.userId) setDragOverId(row.userId);
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
              {/* Seat */}
              <span className="w-10 shrink-0">
                <span className="bg-slate-700 text-slate-400 rounded px-1.5 py-0.5 text-xs font-mono">
                  {row.seatIndex + 1}
                </span>
              </span>

              {/* Player name */}
              <span className="flex-1 min-w-0 font-medium text-sm truncate pr-4">
                {row.displayName}
              </span>

              {/* Role select with drag handle */}
              <div className="w-52 shrink-0 flex items-center gap-2">
                <span
                  className="text-slate-600 cursor-grab active:cursor-grabbing leading-none text-base"
                  title="Drag to swap roles"
                >
                  ⠿
                </span>
                <select
                  value={row.role.id}
                  onChange={(e) => onRoleChange(row.userId, e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 cursor-pointer focus:outline-none focus:border-slate-400"
                >
                  {CATEGORY_ORDER.flatMap((cat) =>
                    allRoles
                      .filter((r) => r.category === cat)
                      .map((r) => (
                        <option key={`${cat}:${r.id}`} value={r.id}>
                          {r.name}
                        </option>
                      )),
                  )}
                </select>
              </div>

              {/* Category badge */}
              <div className="w-28 shrink-0 flex justify-end">
                <span
                  className={`text-xs font-semibold uppercase tracking-wide rounded px-2 py-0.5 ${CATEGORY_STYLE[row.role.category]}`}
                >
                  {row.role.category}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
