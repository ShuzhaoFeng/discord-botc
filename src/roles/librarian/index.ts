import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getRole, getPlayerState, shuffle, pick } from "../../game/utils";
import type { NightOutcomeFieldType } from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "librarian",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.firstOnly,
      nullMsgKey: "nightLibrarianNoOutsiders",
      nullReasonKey: "nightReasonNoOutsiders",
      compute: (ctx) => {
        const { runtime } = ctx.state;
        const { player } = ctx.night;
        const ps = getPlayerState(runtime, player.userId);
        const randomizeInfo = ps?.role.id === "drunk" || (ps?.tags.has("poisoned") ?? false);
        const players = runtime.playerStates.map((ps) => ps.player);
        const outsiders = players.filter(
          (p) => getRole(runtime, p.userId).category === "Outsider",
        );
        if (!randomizeInfo && outsiders.length === 0) return null;
        const otherPlayers = randomizeInfo
          ? players.filter((p) => p.userId !== player.userId)
          : players;
        const osTarget = randomizeInfo
          ? pick(otherPlayers, 1)[0]
          : pick(outsiders, 1)[0];
        const osRole = randomizeInfo
          ? (pick(
              ctx.night.scriptRoles.filter((r) => r.category === "Outsider"),
              1,
            )[0] ?? runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole)
          : osTarget
            ? getRole(runtime, osTarget.userId)
            : runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole;
        const decoy = pick(
          otherPlayers.filter((p) => p.userId !== osTarget?.userId),
          1,
        )[0];
        const two = shuffle([osTarget, decoy].filter((x): x is typeof osTarget & {} => !!x));
        return {
          templateId: "pair_role_info",
          fields: {
            p1: two[0]?.userId ?? player.userId,
            p2: two[1]?.userId ?? player.userId,
            role: osRole.id,
          },
          fieldTypes: (randomizeInfo
            ? { p1: "player", p2: "player", role: "role" }
            : { p1: "player", p2: "player" }) as Record<string, NightOutcomeFieldType>,
          constraints: { pairCategory: "Outsider" },
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
        };
      },
    },
  },
};
