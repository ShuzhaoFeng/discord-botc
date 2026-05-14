import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "imp",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  nightHandlers: {
    action: {
      active: Night.afterFirst,
      buildPrompt: () => [{ optional: false, allowSelf: true }],
      resolve: (ctx, values) => {
        ctx.state.runtime.nightKillIntentId = values[0];
      },
    },
  },
};
