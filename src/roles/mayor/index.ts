import type { RoleDefinition } from "../types";
import { playerDisplayName } from "../../utils/players";
import { createRoleTranslator, localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };
const t = createRoleTranslator(i18n);

export const definition: RoleDefinition = {
  id: "mayor",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  winConditionHandler: {
    evaluate: ({ state, trigger, lang }) => {
      if (trigger !== "day_end_no_execution") return null;
      const aliveStates = state.runtime.playerStates.filter((ps) => ps.alive);
      if (aliveStates.length !== 3) return null;
      const mayor = aliveStates.find((ps) => ps.role.id === "mayor");
      if (!mayor) return null;
      const name = playerDisplayName(state, mayor.player.userId);
      return {
        kind: "good_mayor_three_alive",
        team: "good",
        preamble: t(lang, "winPreamble", { player: name }),
        winAnnouncement: t(lang, "winAnnouncement"),
      };
    },
  },
};
