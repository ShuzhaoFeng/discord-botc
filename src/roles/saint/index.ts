import type { RoleDefinition } from "../types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

// No handler: the executed-Saint win condition is derived from the dead
// Saint's DeathRecord inside evaluateWinCondition.
export const definition: RoleDefinition = {
  id: "saint",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
};
