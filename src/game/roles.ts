import { resolveRoleIdByLocalizedName } from "../i18n";
import { TROUBLE_BREWING } from "../scripts/trouble_brewing";
import { ScriptDefinition } from "../scripts/types";
import { Role } from "./types";

export function getScript(): ScriptDefinition {
  return TROUBLE_BREWING;
}

/** Resolve a role from role id or any localized role name (case-insensitive). */
export function findRole(input: string): Role | undefined {
  const normalizedId = input.trim().toLowerCase();
  const byId = getScript().roles.find((r) => r.id === normalizedId);
  if (byId) return byId;

  const localizedId = resolveRoleIdByLocalizedName(input);
  if (!localizedId) return undefined;
  return getScript().roles.find((r) => r.id === localizedId);
}
