import { resolveRoleIdByLocalizedName } from "../i18n";
import { TROUBLE_BREWING } from "../scripts/trouble_brewing";
import { Role, RoleCategory } from "./types";

function fromList(defs: { id: string }[], category: RoleCategory): Role[] {
  return defs.map(({ id }) => ({ id, category }));
}

export const ROLES: Role[] = [
  ...fromList(TROUBLE_BREWING.townsfolk, "Townsfolk"),
  ...fromList(TROUBLE_BREWING.outsiders, "Outsider"),
  ...fromList(TROUBLE_BREWING.minions, "Minion"),
  ...fromList(TROUBLE_BREWING.demons, "Demon"),
];

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
