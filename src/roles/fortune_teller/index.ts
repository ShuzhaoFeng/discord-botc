import type { RoleDefinition } from "../types";
import { Night } from "../types";
import { getPlayerState, getRole, hasFalsifiedInfo } from "../../utils/runtime";
import { registersAs } from "../../utils/roleDetection";
import type { NightOutcomeFieldType } from "../../game/types";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "fortune_teller",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
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
