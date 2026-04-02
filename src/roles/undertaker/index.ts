import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getRole } from "../../game/utils";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "undertaker",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.afterFirst,
      compute: (ctx) => {
        const { runtime } = ctx.state;
        if (!runtime.lastExecutedPlayerId) return null;
        const executedRole = getRole(runtime, runtime.lastExecutedPlayerId);
        return {
          templateId: "undertaker_role",
          fields: { role: executedRole.id },
          fieldTypes: {},
          allowArbitraryOverride: false,
          reasonKey: "nightReasonExecutionRecord",
        };
      },
    },
  },
};
