"use client";

import type { DraftState, RoleInfo } from "@/types";

interface Props {
  draft: DraftState;
  allRoles: RoleInfo[];
  onHerringChange: (userId: string) => void;
  onDrunkChange: (roleId: string) => void;
  onBluffsChange: (roleIds: [string, string, string]) => void;
}

const selectClass =
  "w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-400 cursor-pointer";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function DerivedFields({
  draft,
  allRoles,
  onHerringChange,
  onDrunkChange,
  onBluffsChange,
}: Props) {
  const assignedIds = new Set(draft.assignments.map((a) => a.role.id));
  const ftInPlay = draft.assignments.some(
    (a) => a.role.id === "fortune_teller",
  );
  const drunkInPlay = draft.assignments.some((a) => a.role.id === "drunk");
  const impInPlay = draft.assignments.some((a) => a.role.id === "imp");

  if (!ftInPlay && !drunkInPlay && !impInPlay) return null;

  const goodPlayers = draft.assignments.filter(
    (a) => a.role.category !== "Demon" && a.role.category !== "Minion",
  );
  const allTownsfolk = allRoles.filter((r) => r.category === "Townsfolk");
  const unassignedTf = allRoles.filter(
    (r) => r.category === "Townsfolk" && !assignedIds.has(r.id),
  );

  function updateBluff(index: number, roleId: string) {
    const current: [string, string, string] = [
      draft.impBluffs?.[0]?.id ?? unassignedTf[0]?.id ?? "",
      draft.impBluffs?.[1]?.id ?? unassignedTf[1]?.id ?? "",
      draft.impBluffs?.[2]?.id ?? unassignedTf[2]?.id ?? "",
    ];
    current[index] = roleId;
    onBluffsChange(current);
  }

  return (
    <div className="space-y-5">
      {ftInPlay && (
        <Field label="🔮 Red Herring">
          <select
            value={draft.redHerring ?? ""}
            onChange={(e) => onHerringChange(e.target.value)}
            className={selectClass}
          >
            {goodPlayers.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </Field>
      )}

      {drunkInPlay && (
        <Field label="🍺 Drunk Fake Role">
          <select
            value={draft.drunkFakeRole?.id ?? ""}
            onChange={(e) => onDrunkChange(e.target.value)}
            className={selectClass}
          >
            {allTownsfolk.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {impInPlay && (
        <Field label="🃏 Imp Bluffs">
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                value={draft.impBluffs?.[i]?.id ?? ""}
                onChange={(e) => updateBluff(i, e.target.value)}
                className={selectClass}
              >
                {unassignedTf.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}
