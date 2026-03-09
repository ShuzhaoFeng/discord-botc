import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getRole, shuffle, pick } from "../../game/utils";
import type { NightOutcomeFieldType } from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "washerwoman",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.firstOnly,
      compute: (ctx) => {
        const { runtime, player, randomizeInfo } = ctx;
        const players = runtime.playerStates.map((ps) => ps.player);
        const townsfolk = players.filter(
          (p) => getRole(runtime, p.userId).category === "Townsfolk",
        );
        const otherPlayers = randomizeInfo
          ? players.filter((p) => p.userId !== player.userId)
          : players;
        const tfTarget = randomizeInfo
          ? pick(otherPlayers, 1)[0]
          : pick(townsfolk, 1)[0];
        const role = randomizeInfo
          ? (pick(
              ctx.scriptRoles.filter((r) => r.category === "Townsfolk"),
              1,
            )[0] ?? runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole)
          : tfTarget
            ? getRole(runtime, tfTarget.userId)
            : runtime.playerStates.find((ps) => ps.player.userId === player.userId)!.effectiveRole;
        const decoy = pick(
          otherPlayers.filter((p) => p.userId !== tfTarget?.userId),
          1,
        )[0];
        const two = shuffle([tfTarget, decoy].filter((x): x is typeof tfTarget & {} => !!x));
        return {
          templateId: "pair_role_info",
          fields: {
            p1: two[0]?.userId ?? player.userId,
            p2: two[1]?.userId ?? player.userId,
            role: role.id,
          },
          fieldTypes: (randomizeInfo
            ? { p1: "player", p2: "player", role: "role" }
            : { p1: "player", p2: "player" }) as Record<string, NightOutcomeFieldType>,
          constraints: { pairCategory: "Townsfolk" },
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
        };
      },
    },
  },
};
