import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getPlayerState, getRole, hasFalsifiedInfo } from "../../utils/runtime";
import { registersAs } from "../../utils/roleDetection";
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
        { optional: false, allowSelf: true },
        { optional: false, allowSelf: true },
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
        const falsified = hasFalsifiedInfo(getPlayerState(runtime, player.userId));
        const choices = (responses.get(player.userId) ?? []).filter(
          (v): v is string => v !== null,
        );
        const hasDemon = choices.some((uid) =>
          registersAs(getRole(runtime, uid), "Demon"),
        );
        const hasHerring = choices.some((uid) =>
          getPlayerState(runtime, uid)?.tags.has("red_herring"),
        );
        const fixedYes = hasDemon || hasHerring;
        const selectedYes = falsified ? Math.random() < 0.5 : fixedYes;
        const fieldTypes: Record<string, NightOutcomeFieldType> = falsified
          ? { yes: "boolean" }
          : {};
        return {
          templateId: "fortune_result",
          fields: { yes: selectedYes },
          fieldTypes,
          allowArbitraryOverride: falsified,
          reasonKey: falsified
            ? "nightReasonFalseInfo"
            : "nightReasonFortuneCheck",
        };
      },
    },
  },
};
