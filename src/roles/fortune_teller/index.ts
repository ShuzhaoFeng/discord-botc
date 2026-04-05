import type { RoleDefinition } from "../types";
import { Night } from "../types";
import {
  getRole,
  getPlayerState,
  registersAsDemonForDetection,
} from "../../game/utils";
import type { NightOutcomeFieldType } from "../../game/types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "fortune_teller",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  nightHandlers: {
    action: {
      active: Night.always,
      buildPrompt: () => [
        { type: "player", optional: false, allowSelf: true },
        { type: "player", optional: false, allowSelf: true },
      ],
      // resolve stores nothing — the two player IDs are already in ctx.responses
      // by the time info.compute runs.
      resolve: () => {},
    },
    info: {
      active: Night.always,
      compute: (ctx) => {
        const { runtime } = ctx.state;
        const { player, responses } = ctx.night;
        const ps = getPlayerState(runtime, player.userId);
        const randomizeInfo =
          ps?.role.id === "drunk" || (ps?.tags.has("poisoned") ?? false);
        const choices = (responses.get(player.userId) ?? []).filter(
          (v): v is string => v !== null,
        );
        const hasDemon = choices.some((uid) =>
          registersAsDemonForDetection(getRole(runtime, uid)),
        );
        const hasHerring = choices.some((uid) =>
          getPlayerState(runtime, uid)?.tags.has("red_herring"),
        );
        const fixedYes = hasDemon || hasHerring;
        const randomizedYes = Math.random() < 0.5;
        const selectedYes = randomizeInfo ? randomizedYes : fixedYes;
        const fieldTypes: Record<string, NightOutcomeFieldType> = randomizeInfo
          ? { yes: "boolean" }
          : {};
        return {
          templateId: "fortune_result",
          fields: { yes: selectedYes },
          fieldTypes,
          allowArbitraryOverride: randomizeInfo,
          reasonKey: randomizeInfo
            ? "nightReasonFalseInfo"
            : "nightReasonFortuneCheck",
        };
      },
    },
  },
};
