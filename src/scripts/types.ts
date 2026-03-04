import type { RoleDefinition } from "../roles/types";

export interface ScriptDefinition {
  townsfolk: RoleDefinition[];
  outsiders: RoleDefinition[];
  minions: RoleDefinition[];
  demons: RoleDefinition[];
}
