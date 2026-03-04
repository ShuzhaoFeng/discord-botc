export type { RoleDefinition, LocalizedString } from "./types";

import { definition as imp } from "./imp";
import { definition as poisoner } from "./poisoner";
import { definition as spy } from "./spy";
import { definition as scarlet_woman } from "./scarlet_woman";
import { definition as baron } from "./baron";
import { definition as washerwoman } from "./washerwoman";
import { definition as librarian } from "./librarian";
import { definition as investigator } from "./investigator";
import { definition as chef } from "./chef";
import { definition as empath } from "./empath";
import { definition as fortune_teller } from "./fortune_teller";
import { definition as undertaker } from "./undertaker";
import { definition as monk } from "./monk";
import { definition as ravenkeeper } from "./ravenkeeper";
import { definition as virgin } from "./virgin";
import { definition as slayer } from "./slayer";
import { definition as soldier } from "./soldier";
import { definition as mayor } from "./mayor";
import { definition as butler } from "./butler";
import { definition as drunk } from "./drunk";
import { definition as recluse } from "./recluse";
import { definition as saint } from "./saint";

import type { RoleDefinition } from "./types";

export const ALL_ROLE_DEFINITIONS: RoleDefinition[] = [
  imp,
  poisoner,
  spy,
  scarlet_woman,
  baron,
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
  butler,
  drunk,
  recluse,
  saint,
];
