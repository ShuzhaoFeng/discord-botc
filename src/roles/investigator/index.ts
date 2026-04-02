import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getRole, getPlayerState, shuffle, pick } from "../../game/utils";
import type { NightOutcomeFieldType } from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "investigator",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.firstOnly,
      compute: (ctx) => {
        const { runtime } = ctx.state;
        const { player } = ctx.night;
        const ps = getPlayerState(runtime, player.userId);
        const randomizeInfo = ps?.role.id === "drunk" || (ps?.tags.has("poisoned") ?? false);
        const players = runtime.playerStates.map((ps) => ps.player);
        const minions = players.filter(
          (p) => getRole(runtime, p.userId).category === "Minion",
        );
        const otherPlayers = randomizeInfo
          ? players.filter((p) => p.userId !== player.userId)
          : players;
        const minionTarget = randomizeInfo
          ? pick(otherPlayers, 1)[0]
          : pick(minions, 1)[0];
        const minionRole = randomizeInfo
          ? (pick(
              ctx.night.scriptRoles.filter((r) => r.category === "Minion"),
              1,
            )[0] ?? runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole)
          : minionTarget
            ? getRole(runtime, minionTarget.userId)
            : runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole;
        const decoy = pick(
          otherPlayers.filter((p) => p.userId !== minionTarget?.userId),
          1,
        )[0];
        const two = shuffle([minionTarget, decoy].filter((x): x is typeof minionTarget & {} => !!x));
        return {
          templateId: "pair_role_info",
          fields: {
            p1: two[0]?.userId ?? player.userId,
            p2: two[1]?.userId ?? player.userId,
            role: minionRole.id,
          },
          fieldTypes: (randomizeInfo
            ? { p1: "player", p2: "player", role: "role" }
            : { p1: "player", p2: "player" }) as Record<string, NightOutcomeFieldType>,
          constraints: { pairCategory: "Minion" },
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
        };
      },
    },
  },
};
