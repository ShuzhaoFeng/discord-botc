import type { RoleDefinition } from "../types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "chef",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
};
