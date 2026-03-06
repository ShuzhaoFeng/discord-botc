import type { RoleDefinition } from "../roles/types";
import type { RoleCategory } from "../game/types";

export interface ScriptRole extends RoleDefinition {
  category: RoleCategory;
}

export interface ScriptDefinition {
  roles: ScriptRole[];
}
