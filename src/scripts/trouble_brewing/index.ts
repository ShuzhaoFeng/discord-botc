import type { ScriptDefinition } from "../types";
import { definition as imp } from "../../roles/imp";
import { definition as poisoner } from "../../roles/poisoner";
import { definition as spy } from "../../roles/spy";
import { definition as scarlet_woman } from "../../roles/scarlet_woman";
import { definition as baron } from "../../roles/baron";
import { definition as washerwoman } from "../../roles/washerwoman";
import { definition as librarian } from "../../roles/librarian";
import { definition as investigator } from "../../roles/investigator";
import { definition as chef } from "../../roles/chef";
import { definition as empath } from "../../roles/empath";
import { definition as fortune_teller } from "../../roles/fortune_teller";
import { definition as undertaker } from "../../roles/undertaker";
import { definition as monk } from "../../roles/monk";
import { definition as ravenkeeper } from "../../roles/ravenkeeper";
import { definition as virgin } from "../../roles/virgin";
import { definition as slayer } from "../../roles/slayer";
import { definition as soldier } from "../../roles/soldier";
import { definition as mayor } from "../../roles/mayor";
import { definition as butler } from "../../roles/butler";
import { definition as drunk } from "../../roles/drunk";
import { definition as recluse } from "../../roles/recluse";
import { definition as saint } from "../../roles/saint";

export const TROUBLE_BREWING: ScriptDefinition = {
  townsfolk: [
    washerwoman,
    librarian,
    investigator,
    chef,
    empath,
    fortune_teller,
    undertaker,
    monk,
    ravenkeeper,
    virgin,
    slayer,
    soldier,
    mayor,
  ],
  outsiders: [butler, drunk, recluse, saint],
  minions: [poisoner, spy, scarlet_woman, baron],
  demons: [imp],
};
