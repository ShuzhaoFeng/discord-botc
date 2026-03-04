import { resolveRoleIdByLocalizedName } from "../i18n";
import { Role, RoleCategory } from "./types";

const ROLE_DEFS: Array<{ id: string; category: RoleCategory }> = [
  { id: "imp", category: "Demon" },
  { id: "poisoner", category: "Minion" },
  { id: "spy", category: "Minion" },
  { id: "scarlet_woman", category: "Minion" },
  { id: "baron", category: "Minion" },
  { id: "washerwoman", category: "Townsfolk" },
  { id: "librarian", category: "Townsfolk" },
  { id: "investigator", category: "Townsfolk" },
  { id: "chef", category: "Townsfolk" },
  { id: "empath", category: "Townsfolk" },
  { id: "fortune_teller", category: "Townsfolk" },
  { id: "undertaker", category: "Townsfolk" },
  { id: "monk", category: "Townsfolk" },
  { id: "ravenkeeper", category: "Townsfolk" },
  { id: "virgin", category: "Townsfolk" },
  { id: "slayer", category: "Townsfolk" },
  { id: "soldier", category: "Townsfolk" },
  { id: "mayor", category: "Townsfolk" },
  { id: "butler", category: "Outsider" },
  { id: "drunk", category: "Outsider" },
  { id: "recluse", category: "Outsider" },
  { id: "saint", category: "Outsider" },
];

export const ROLES: Role[] = ROLE_DEFS.map(({ id, category }) => ({
  id,
  category,
}));

// Lookup helpers
export const ROLE_BY_ID = new Map<string, Role>(ROLES.map((r) => [r.id, r]));

export const TOWNSFOLK = ROLES.filter((r) => r.category === "Townsfolk");
export const OUTSIDERS = ROLES.filter((r) => r.category === "Outsider");
export const MINIONS = ROLES.filter((r) => r.category === "Minion");
export const DEMONS = ROLES.filter((r) => r.category === "Demon");

/** Resolve a role from role id or any localized role name (case-insensitive). */
export function findRole(input: string): Role | undefined {
  const normalizedId = input.trim().toLowerCase();
  const byId = ROLE_BY_ID.get(normalizedId);
  if (byId) return byId;

  const localizedId = resolveRoleIdByLocalizedName(input);
  if (!localizedId) return undefined;
  return ROLE_BY_ID.get(localizedId);
}
