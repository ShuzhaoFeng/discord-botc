import type { RoleDefinition } from "../types";
import { Night } from "../types";
import {
  getPlayerState,
  shuffle,
  pick,
  registersAsMinionForDetection,
} from "../../game/utils";
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
        const randomizeInfo =
          ps?.role.id === "drunk" || (ps?.tags.has("poisoned") ?? false);
        const players = runtime.playerStates.map((ps) => ps.player);
        const minionRoles = ctx.night.scriptRoles.filter(
          (r) => r.category === "Minion",
        );
        const minionCandidates = runtime.playerStates.flatMap((candidatePs) => {
          if (!registersAsMinionForDetection(candidatePs.role)) return [];
          if (candidatePs.role.category === "Minion") {
            return [
              { player: candidatePs.player, roleId: candidatePs.role.id },
            ];
          }
          const fakeMinion = pick(minionRoles, 1)[0];
          if (!fakeMinion) return [];
          return [{ player: candidatePs.player, roleId: fakeMinion.id }];
        });
        const otherPlayers = randomizeInfo
          ? players.filter((p) => p.userId !== player.userId)
          : players;
        const minionTarget = pick(minionCandidates, 1)[0];
        const targetPlayer = randomizeInfo
          ? pick(otherPlayers, 1)[0]
          : minionTarget?.player;
        const minionRoleId = randomizeInfo
          ? (pick(minionRoles, 1)[0]?.id ??
            runtime.playerStates.find(
              (ps) => ps.player.userId === player.userId,
            )!.effectiveRole.id)
          : minionTarget
            ? minionTarget.roleId
            : runtime.playerStates.find(
                (ps) => ps.player.userId === player.userId,
              )!.effectiveRole.id;
        const decoy = pick(
          otherPlayers.filter((p) => p.userId !== targetPlayer?.userId),
          1,
        )[0];
        const two = shuffle(
          [targetPlayer, decoy].filter(
            (x): x is Exclude<typeof x, undefined> => !!x,
          ),
        );
        return {
          templateId: "pair_role_info",
          fields: {
            p1: two[0]?.userId ?? player.userId,
            p2: two[1]?.userId ?? player.userId,
            role: minionRoleId,
          },
          fieldTypes: (randomizeInfo
            ? { p1: "player", p2: "player", role: "role" }
            : { p1: "player", p2: "player" }) as Record<
            string,
            NightOutcomeFieldType
          >,
          constraints: { pairCategory: "Minion" },
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo
            ? "nightReasonFalseInfo"
            : "nightReasonDecoyPair",
        };
      },
    },
  },
};
