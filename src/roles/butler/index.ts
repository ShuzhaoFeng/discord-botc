import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getPlayerState } from "../../game/utils";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "butler",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  nightHandlers: {
    action: {
      active: Night.always,
      buildPrompt: () => [{ optional: false, allowSelf: false }],
      resolve: (ctx, values) => {
        ctx.state.runtime.playerStates.forEach((ps) => ps.tags.delete("butler_master"));
        const targetPs = getPlayerState(ctx.state.runtime, values[0]!);
        if (targetPs) targetPs.tags.add("butler_master");
      },
    },
  },
};
