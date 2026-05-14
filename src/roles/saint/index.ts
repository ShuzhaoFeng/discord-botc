import type { RoleDefinition } from "../types";
import { playerDisplayName } from "../../utils/players";
import { createRoleTranslator, localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };
const t = createRoleTranslator(i18n);

export const definition: RoleDefinition = {
  id: "saint",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  winConditionHandler: {
    evaluate: ({ state, lang }) => {
      const executedSaint = state.runtime.playerStates.find(
        (ps) =>
          ps.role.id === "saint" &&
          !ps.alive &&
          ps.death?.byExecution === true,
      );
      if (!executedSaint) return null;
      const name = playerDisplayName(state, executedSaint.player.userId);
      return {
        kind: "evil_saint_executed",
        team: "evil",
        preamble: t(lang, "winPreamble", { player: name }),
        winAnnouncement: t(lang, "winAnnouncement"),
      };
    },
  },
};
