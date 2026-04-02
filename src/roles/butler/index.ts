import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getPlayerState } from "../../game/utils";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "butler",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    action: {
      active: Night.always,
      buildPrompt: () => [{ type: "player", optional: false, allowSelf: false }],
      resolve: (ctx, values) => {
        ctx.state.runtime.playerStates.forEach((ps) => ps.tags.delete("butler_master"));
        const targetPs = getPlayerState(ctx.state.runtime, values[0]!);
        if (targetPs) targetPs.tags.add("butler_master");
      },
    },
  },
};
