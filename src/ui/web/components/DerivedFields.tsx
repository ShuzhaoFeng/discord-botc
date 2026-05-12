"use client";

import type { DraftState, RoleInfo } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

interface Props {
  draft: DraftState;
  allRoles: RoleInfo[];
  onHerringChange: (userId: string) => void;
  onDrunkChange: (roleId: string) => void;
  onBluffsChange: (roleIds: [string, string, string]) => void;
}

const CATEGORY_TINT: Record<string, string> = {
  Townsfolk: "var(--color-townsfolk)",
  Outsider: "var(--color-outsider)",
  Minion: "var(--color-minion)",
  Demon: "var(--color-demon)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-parchment-2/60 mb-1.5 font-display">
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
  const unassignedGood = allRoles.filter(
    (r) =>
      (r.category === "Townsfolk" || r.category === "Outsider") &&
      !assignedIds.has(r.id),
  );

  function updateBluff(index: number, roleId: string) {
    const current: [string, string, string] = [
      draft.impBluffs?.[0]?.id ?? unassignedGood[0]?.id ?? "",
      draft.impBluffs?.[1]?.id ?? unassignedGood[1]?.id ?? "",
      draft.impBluffs?.[2]?.id ?? unassignedGood[2]?.id ?? "",
    ];
    current[index] = roleId;
    onBluffsChange(current);
  }

  return (
    <div className="space-y-5">
      {ftInPlay && (
        <Field label="🔮 Red Herring">
          <Select
            value={draft.redHerring ?? ""}
            onValueChange={onHerringChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a good player" />
            </SelectTrigger>
            <SelectContent>
              {goodPlayers.map((a) => (
                <SelectItem
                  key={a.userId}
                  value={a.userId}
                  tint={CATEGORY_TINT[a.role.category]}
                >
                  {a.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {drunkInPlay && (
        <Field label="🍺 Drunk Fake Role">
          <Select
            value={draft.drunkFakeRole?.id ?? ""}
            onValueChange={onDrunkChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a Townsfolk role" />
            </SelectTrigger>
            <SelectContent>
              {allTownsfolk.map((r) => (
                <SelectItem
                  key={r.id}
                  value={r.id}
                  tint={CATEGORY_TINT.Townsfolk}
                >
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {impInPlay && (
        <Field label="🃏 Imp Bluffs">
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Select
                key={i}
                value={draft.impBluffs?.[i]?.id ?? ""}
                onValueChange={(v) => updateBluff(i, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Bluff ${i + 1}`} />
                </SelectTrigger>
                <SelectContent>
                  {unassignedGood.map((r) => (
                    <SelectItem
                      key={r.id}
                      value={r.id}
                      tint={CATEGORY_TINT[r.category]}
                    >
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}
