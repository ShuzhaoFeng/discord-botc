import type { Role } from "../game/types";

export type DetectionTarget =
  | "Townsfolk"
  | "Outsider"
  | "Minion"
  | "Demon"
  | "Evil";

/**
 * True if `role` registers as `target` to detection abilities.
 *
 *   - Spy registers as Townsfolk / Outsider / Minion / Evil at 50% each;
 *     never as Demon.
 *   - Recluse registers as Townsfolk / Outsider / Minion / Demon / Evil at
 *     50% each.
 *   - Every other role registers strictly by its true category.
 *   - The "Evil" target maps to Minion ∪ Demon.
 */
export function registersAs(role: Role, target: DetectionTarget): boolean {
  if (role.id === "spy") {
    if (target === "Demon") return false;
    return Math.random() < 0.5;
  }
  if (role.id === "recluse") {
    return Math.random() < 0.5;
  }
  if (target === "Evil") {
    return role.category === "Minion" || role.category === "Demon";
  }
  return role.category === target;
}
