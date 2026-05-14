import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "undertaker",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
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
