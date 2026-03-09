import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { shuffle } from "../../game/utils";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "spy",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.always,
      compute: (ctx) => {
        const { runtime, randomizeInfo } = ctx;
        const playerStates = runtime.playerStates;

        if (randomizeInfo) {
          // Shuffle role IDs across players so every entry is plausibly wrong.
          const roles = shuffle(playerStates.map((ps) => ps.role));
          const fields: Record<string, string> = {};
          const fieldTypes: Record<string, "role"> = {};
          playerStates.forEach((ps, i) => {
            fields[ps.player.displayName] = roles[i].id;
            fieldTypes[ps.player.displayName] = "role";
          });
          return {
            templateId: "grimoire",
            fields,
            fieldTypes,
            allowArbitraryOverride: true,
            reasonKey: "nightReasonFalseGrimoire",
          };
        } else {
          const fields: Record<string, string> = {};
          playerStates.forEach((ps) => {
            fields[ps.player.displayName] = ps.role.id;
          });
          return {
            templateId: "grimoire",
            fields,
            fieldTypes: {},
            allowArbitraryOverride: false,
            reasonKey: "nightReasonGrimoireReveal",
          };
        }
      },
    },
  },
};
