import type { RoleDefinition } from "../types";
import { Night } from "../types";
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
        // daySession is the just-ended day (status="ended") at this point.
        // Revived players have their death record cleared, so they drop out.
        const dayNumber = runtime.daySession?.dayNumber;
        if (dayNumber === undefined) return null;
        const executedPs = runtime.playerStates.find(
          (ps) =>
            ps.death?.byExecution === true &&
            ps.death.dayNumber === dayNumber,
        );
        if (!executedPs) return null;
        return {
          templateId: "undertaker_role",
          fields: { role: executedPs.role.id },
          fieldTypes: {},
          allowArbitraryOverride: false,
          reasonKey: "nightReasonExecutionRecord",
        };
      },
    },
  },
};
