import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getPlayerState, registersAsEvilForDetection } from "../../game/utils";
import type {
  NightOutcomeFieldType,
  Player,
  RuntimeState,
} from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

function findAliveNeighborInDirection(
  runtime: RuntimeState,
  startIndex: number,
  dir: -1 | 1,
): Player | undefined {
  const n = runtime.playerStates.length;
  for (let step = 1; step < n; step++) {
    const idx = (startIndex + dir * step + n) % n;
    const ps = runtime.playerStates[idx];
    if (ps.alive) return ps.player;
  }
  return undefined;
}

function computeEmpathCount(runtime: RuntimeState, empathId: string): number {
  const empathPs = getPlayerState(runtime, empathId);
  if (!empathPs) return 0;
  const left = findAliveNeighborInDirection(
    runtime,
    empathPs.player.seatIndex,
    -1,
  );
  const right = findAliveNeighborInDirection(
    runtime,
    empathPs.player.seatIndex,
    1,
  );
  const neighborIds = [left?.userId, right?.userId].filter(
    (x): x is string => !!x,
  );
  let count = 0;
  for (const uid of neighborIds) {
    const neighborPs = getPlayerState(runtime, uid);
    if (neighborPs && registersAsEvilForDetection(neighborPs.role)) count += 1;
  }
  return count;
}

export const definition: RoleDefinition = {
  id: "empath",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    info: {
      active: Night.always,
      compute: (ctx) => {
        const { runtime } = ctx.state;
        const { player } = ctx.night;
        const ps = getPlayerState(runtime, player.userId);
        const randomizeInfo =
          ps?.role.id === "drunk" || (ps?.tags.has("poisoned") ?? false);
        const leftNeighbor = findAliveNeighborInDirection(
          runtime,
          player.seatIndex,
          -1,
        );
        const rightNeighbor = findAliveNeighborInDirection(
          runtime,
          player.seatIndex,
          1,
        );
        const fixedValue = computeEmpathCount(runtime, player.userId);
        const randomizedValue = Math.floor(Math.random() * 3);
        const selectedValue = randomizeInfo ? randomizedValue : fixedValue;
        const fieldTypes: Record<string, NightOutcomeFieldType> = randomizeInfo
          ? { left: "player", right: "player", count: "number" }
          : {};
        return {
          templateId: "empath_count",
          fields: {
            left: leftNeighbor?.userId ?? player.userId,
            right: rightNeighbor?.userId ?? player.userId,
            count: selectedValue,
          },
          fieldTypes,
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo
            ? "nightReasonFalseInfo"
            : "nightReasonEmpathNeighbors",
        };
      },
    },
  },
};
