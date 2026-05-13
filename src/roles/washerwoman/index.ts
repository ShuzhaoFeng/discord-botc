import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { buildDecoyPairInfo } from "../../utils/nightInfo";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "washerwoman",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.firstOnly,
      compute: (ctx) =>
        buildDecoyPairInfo({
          runtime: ctx.state.runtime,
          playerId: ctx.night.player.userId,
          scriptRoles: ctx.night.scriptRoles,
          category: "Townsfolk",
          reasonKey: "nightReasonDecoyPair",
        }),
    },
  },
};
