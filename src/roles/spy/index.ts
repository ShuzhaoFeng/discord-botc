import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { shuffle } from "../../utils/random";
import { getPlayerState, hasFalsifiedInfo } from "../../utils/runtime";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "spy",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  nightHandlers: {
    info: {
      active: Night.always,
      compute: (ctx) => {
        const { runtime } = ctx.state;
        const { player } = ctx.night;
        const falsified = hasFalsifiedInfo(getPlayerState(runtime, player.userId));
        const playerStates = runtime.playerStates;

        if (falsified) {
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
        }

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
      },
    },
  },
};
