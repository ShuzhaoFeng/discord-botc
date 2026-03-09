import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { isEvil } from "../../game/utils";
import type { NightOutcomeFieldType, RuntimeState } from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

function computeChefCount(runtime: RuntimeState): number {
  const n = runtime.playerStates.length;
  if (n <= 1) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const psA = runtime.playerStates[i];
    const psB = runtime.playerStates[(i + 1) % n];
    if (isEvil(psA.role) && isEvil(psB.role)) count += 1;
  }
  return count;
}

export const definition: RoleDefinition = {
  id: "chef",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.firstOnly,
      compute: (ctx) => {
        const { runtime, randomizeInfo } = ctx;
        const numEvil = runtime.playerStates.filter((ps) => isEvil(ps.role)).length;
        const fixedValue = computeChefCount(runtime);
        const randomizedValue = Math.floor(Math.random() * Math.max(numEvil, 1));
        const selectedValue = randomizeInfo ? randomizedValue : fixedValue;
        const fieldTypes: Record<string, NightOutcomeFieldType> = randomizeInfo
          ? { count: "number" }
          : {};
        return {
          templateId: "chef_count",
          fields: { count: selectedValue },
          fieldTypes,
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo ? "nightReasonFalseInfo" : "nightReasonChefSeating",
        };
      },
    },
  },
};
