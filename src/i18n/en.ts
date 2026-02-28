import { Role } from "../game/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => string;

export interface Messages {
  // ── Errors ────────────────────────────────────────────────────────────────
  errorPlayerCount: (n: number) => string;
  errorPlayerCountMin5: () => string;
  errorPlayerCountMax16: () => string;
  errorNotGameChannel: () => string;
  errorAlreadyDecided: () => string;
  errorIamNeedsSix: () => string;
  errorYouareNeedsFifteen: () => string;
  errorNotStoryteller: () => string;
  errorNoActiveGame: () => string;
  errorAlreadyConfirmed: () => string;

  // ── Game setup ────────────────────────────────────────────────────────────
  gameCreating: (players: string[]) => string;
  gameChannelReady: (gameId: string, players: string[]) => string;
  chooseStoryteller: () => string;

  // ── Storyteller decision ──────────────────────────────────────────────────
  iamAccepted: (username: string) => string;
  youareAccepted: () => string;

  // ── Role assignment ───────────────────────────────────────────────────────
  rolesDistributed: () => string;
  roleDmHeader: (gameId: string) => string;
  roleDmRole: (roleName: string, category: string) => string;
  roleDmAbility: (description: string) => string;
  roleDmBeginnerGuide: (roleId: string) => string;
  roleDmDrunkNote: (fakeName: string) => string;
  roleDmImpBluffs: (b1: string, b2: string, b3: string) => string;
  roleDmImpMinions: (minions: string) => string;
  roleDmMinionDemon: (demon: string) => string;
  roleDmMinionPeers: (peers: string) => string;

  // ── Draft message ─────────────────────────────────────────────────────────
  draftHeader: (gameId: string) => string;
  draftTableHeader: () => string;
  draftRedHerring: (playerName: string) => string;
  draftImpBluffs: (r1: string, r2: string, r3: string) => string;
  draftCommands: () => string;
  draftAdjusted: (note: string) => string;

  // ── Draft command errors ───────────────────────────────────────────────────
  draftCmdUnknownPlayer: (name: string) => string;
  draftCmdUnknownRole: (name: string) => string;
  draftCmdAmbiguousPlayer: (name: string) => string;
  draftCmdSwapUsage: () => string;
  draftCmdRoleUsage: () => string;
  draftCmdHerringUsage: () => string;
  draftCmdDrunkUsage: () => string;
  draftCmdBluffUsage: () => string;
  draftCmdAssignUsage: () => string;
  draftCmdRoleError: (msg: string) => string;
  draftCmdValidationError: (msg: string) => string;
  draftCmdHerringNotGood: () => string;
  draftCmdHerringNoFT: () => string;
  draftCmdDrunkNotInPlay: () => string;
  draftCmdDrunkNotTownsfolk: (name: string) => string;
  draftCmdDrunkAlreadyAssigned: (name: string) => string;
  draftCmdBluffNoImp: () => string;
  draftCmdBluffNotTownsfolk: (name: string) => string;
  draftCmdBluffAlreadyAssigned: (name: string) => string;
  draftCmdBluffDuplicate: () => string;
  draftCmdAssignParseError: (line: string) => string;
  draftCmdAssignPlayerCount: (got: number, want: number) => string;
  draftConfirmed: () => string;

  // ── Language ───────────────────────────────────────────────────────────────
  langSet: (lang: string) => string;
  langUnknown: (lang: string) => string;

  // ── Rulebook ───────────────────────────────────────────────────────────────
  rulebookListTitle: () => string;
  rulebookListFooter: () => string;
  rulebookRoleNotFound: (name: string) => string;
}

function categoryLabel(cat: string): string {
  return cat; // English category names are unchanged
}

export const ROLE_GUIDE_EN: Record<string, string> = {
  imp:
    `**Rules reminder:**\n` +
    `• Each night except the first, choose a player: they die.\n` +
    `• If you choose yourself this way, you die, and a living Minion becomes the Imp.\n` +
    `• You know 3 bluff roles that do not exist in this game; claim one of these if needed.\n` +
    `• In this script, you are the Demon.`,
  poisoner:
    `**Rules reminder:**\n` +
    `• Each night, choose a player: they are poisoned tonight and tomorrow day.\n` +
    `• A poisoned player has no ability while poisoned.\n` +
    `• The poisoned state ends at dusk the following day.`,
  spy:
    `**Rules reminder:**\n` +
    `• Each night, you see the Grimoire.\n` +
    `• You may register as good to relevant abilities.\n` +
    `• You may register as a Townsfolk or Outsider, even if dead.`,
  scarlet_woman:
    `**Rules reminder:**\n` +
    `• If there are 5 or more players alive and the Demon dies, you become the Demon.\n` +
    `• Travellers do not count for this threshold.\n` +
    `• If this does not trigger, the Demon death ends the game normally.`,
  baron:
    `**Rules reminder:**\n` +
    `• During setup, there are +2 Outsiders and -2 Townsfolk.\n` +
    `• This setup change does not revert if you die.\n` +
    `• Only you and players aware of the existence of the baron are aware of this information.`,
  washerwoman:
    `**Rules reminder:**\n` +
    `• During the first night, you are shown two player names and one Townsfolk role.\n` +
    `• Exactly one of those two players has that role.\n` +
    `• You learn this only once and then learn nothing more.`,
  librarian:
    `**Rules reminder:**\n` +
    `• During the first night, you are shown two player names and one Outsider role.\n` +
    `• Exactly one of those two players has that role.\n` +
    `• If no Outsiders are in play, you learn that zero Outsiders are in play instead.\n` +
    `• You learn this only once and then learn nothing more.`,
  investigator:
    `**Rules reminder:**\n` +
    `• During the first night, you are shown two player names and one Minion role.\n` +
    `• Exactly one of those two players has that role.\n` +
    `• You learn this only once and then learn nothing more.`,
  chef:
    `**Rules reminder:**\n` +
    `• During the first night, you learn how many pairs of evil players are adjacent.\n` +
    `• A chain of three adjacent evil players counts as two pairs, etc.\n` +
    `• You learn this only once and then learn nothing more.`,
  empath:
    `**Rules reminder:**\n` +
    `• Each night, you learn how many of your two alive neighbors are evil (0, 1, or 2).\n` +
    `• Dead neighbors are skipped; use the next closest alive neighbor in that direction.\n` +
    `• You receive this information every night while alive.`,
  fortune_teller:
    `**Rules reminder:**\n` +
    `• Each night, choose two players: learn whether there is a Demon among them (yes/no).\n` +
    `• One good player is your Red Herring and also returns “yes.” upon being checked.\n` +
    `• You may choose alive players, dead players, and yourself.`,
  undertaker:
    `**Rules reminder:**\n` +
    `• Each night except the first, you learn which character died by execution today.\n` +
    `• If no one was executed today, you learn nothing.\n` +
    `• You receive this information each eligible night while alive.`,
  monk:
    `**Rules reminder:**\n` +
    `• Each night except the first, choose a player (not yourself).\n` +
    `• That player is safe from the Demon tonight.\n` +
    `• You receive this choice each eligible night while alive.`,
  ravenkeeper:
    `**Rules reminder:**\n` +
    `• If you die at night, you are woken to choose a player.\n` +
    `• You then learn that player’s true character.\n` +
    `• If you die by execution, this ability does not trigger.`,
  virgin:
    `**Rules reminder:**\n` +
    `• The first time you are nominated, check the nominator’s character type.\n` +
    `• If the nominator is a Townsfolk, they are executed immediately.\n` +
    `• This effect can trigger only once.`,
  slayer:
    `**Rules reminder:**\n` +
    `• Once per game, during the day, publicly choose a player.\n` +
    `• If that player is the Demon, they die immediately.\n` +
    `• If that player is not the Demon, nothing happens.`,
  soldier:
    `**Rules reminder:**\n` +
    `• You are safe from the Demon.\n` +
    `• The Demon cannot kill you at night while this protection applies.\n` +
    `• This does not prevent execution or poisoning.`,
  mayor:
    `**Rules reminder:**\n` +
    `• If only 3 players live and no execution occurs, your team wins.\n` +
    `• If you die at night, another player might die instead.\n` +
    `• You are a Townsfolk character.`,
  butler:
    `**Rules reminder:**\n` +
    `• Each night, choose a player (not yourself).\n` +
    `• Tomorrow, you may vote only if they are voting too.\n` +
    `• You repeat this choice each night while alive.`,
  drunk:
    `**Rules reminder:**\n` +
    `• You do not know you are the Drunk.\n` +
    `• You think you are a Townsfolk character, but you are not.\n` +
    `• Your ability does not function as the believed Townsfolk role.`,
  recluse:
    `**Rules reminder:**\n` +
    `• You might register as evil to abilities that detect alignment.\n` +
    `• You might register as a Minion or Demon.\n` +
    `• This can apply even if you are dead.`,
  saint:
    `**Rules reminder:**\n` +
    `• If you die by execution, your team loses immediately.\n` +
    `• This is an Outsider with a loss-condition ability.\n` +
    `• Night death does not trigger this loss condition.`,
};

export const en: Messages = {
  // Errors
  errorPlayerCount: (n) =>
    `❌ Invalid player count (${n}). Please mention between 5 and 16 players.`,
  errorPlayerCountMin5: () =>
    `❌ Too few players. You need at least 5 players to start a game.`,
  errorPlayerCountMax16: () =>
    `❌ Too many players. The maximum is 16 people (including a potential storyteller).`,
  errorNotGameChannel: () =>
    `❌ This command can only be used in an active game channel.`,
  errorAlreadyDecided: () =>
    `❌ A storyteller has already been decided for this game.`,
  errorIamNeedsSix: () =>
    `❌ There are only 5 people in this game. Using \`/iam\` would leave only 4 players — below the minimum of 5. Use \`/youare\` instead.`,
  errorYouareNeedsFifteen: () =>
    `❌ There are 16 people in this game. Automated mode cannot manage 16 players — the maximum is 15. Please use \`/iam\` so one person becomes the storyteller.`,
  errorNotStoryteller: () =>
    `❌ Only the storyteller can send commands in DM during role assignment.`,
  errorNoActiveGame: () =>
    `❌ No active game found for your current storyteller session.`,
  errorAlreadyConfirmed: () =>
    `❌ The draft has already been confirmed. No further changes are accepted.`,

  // Game setup
  gameCreating: (players) =>
    `Shadows gather for ${players.join(", ")}… Conjuring the chamber.`,
  gameChannelReady: (gameId, players) =>
    `🏰 **The fate of ${gameId} will be revealed.**\n\nThe souls have assembled: ${players.join(", ")}\n\nWho will guide them through the night?`,
  chooseStoryteller: () =>
    `Step forward as the Storyteller with \`/iam\`, or surrender the night to fate with \`/youare\`.`,

  // Storyteller decision
  iamAccepted: (username) =>
    `🎭 **${username}** takes the Storyteller's chair. The loom of destiny rests in mortal hands—the ritual runs in **Manual Mode**.\nA version of fate has been whispered to the Storyteller via DM.`,
  youareAccepted: () =>
    `🌑 The clocktower chimes. **Automated Mode** activated. The Storyteller has been chosen by fate itself.`,

  // Role assignment
  rolesDistributed: () =>
    `✅ The roles are cast. Each soul now carries a secret—the night draws close.`,
  roleDmHeader: (gameId) => `🕯️ **Your Fate — ${gameId}**`,
  roleDmRole: (roleName, category) =>
    `**${roleName}**  ·  *${category}*`,
  roleDmAbility: (description) => `**Ability:** ${description}`,
  roleDmBeginnerGuide: (roleId) =>
    ROLE_GUIDE_EN[roleId] ??
    `**A word of guidance:**\n• Listen well, share what you know, and stand with your kin.`,
  roleDmDrunkNote: (_fakeName) =>
    `*(You walk in fog—you believe yourself to be this Townsfolk, but your ability never works and what you hear may be false.)*`,
  roleDmImpBluffs: (b1, b2, b3) =>
    `🃏 **Your masks of innocence**: ${b1}, ${b2}, ${b3}`,
  roleDmImpMinions: (minions) => `👥 **Your servants in shadow**: ${minions}`,
  roleDmMinionDemon: (demon) => `🩸 **The master you serve**: ${demon}`,
  roleDmMinionPeers: (peers) => `👥 **Your kin in shadow**: ${peers}`,

  // Draft
  draftHeader: (gameId) => `📜 **Role Assignment Draft** — ${gameId}`,
  draftTableHeader: () =>
    `\`\`\`\nPlayer               Role                 Type\n${"─".repeat(54)}\n`,
  draftRedHerring: (playerName) =>
    `🔮 Red Herring (Fortune Teller): ${playerName}`,
  draftImpBluffs: (r1, r2, r3) => `🃏 Imp Bluffs: ${r1}, ${r2}, ${r3}`,
  draftCommands: () =>
    [
      `Commands (one per line), end with CONFIRM:`,
      `• \`SWAP <p1> <p2>\`               — exchange two players' roles`,
      `• \`ROLE <player> <new-role>\`     — replace a player's role (same category; Baron rules apply)`,
      `• \`HERRING <player>\`             — change the Fortune Teller's red herring`,
      `• \`DRUNK <role>\`                 — change the Drunk's fake role`,
      `• \`BLUFF <role1>, <role2>, <role3>\` — change the Imp's bluff roles`,
      `• \`ASSIGN\` (block)               — replace the entire assignment (list every player: role, end with CONFIRM)`,
      `• \`CONFIRM\`                       — finalize and send roles to all players`,
    ].join("\n"),
  draftAdjusted: (note) => `⚙️ ${note}`,

  // Draft command errors
  draftCmdUnknownPlayer: (name) => `❌ Unknown player: "${name}".`,
  draftCmdUnknownRole: (name) => `❌ Unknown role: "${name}".`,
  draftCmdAmbiguousPlayer: (name) =>
    `❌ Ambiguous player name: "${name}". Please use the full username.`,
  draftCmdSwapUsage: () => `❌ Usage: \`SWAP <player1> <player2>\``,
  draftCmdRoleUsage: () => `❌ Usage: \`ROLE <player> <new-role>\``,
  draftCmdHerringUsage: () => `❌ Usage: \`HERRING <player>\``,
  draftCmdDrunkUsage: () => `❌ Usage: \`DRUNK <role>\``,
  draftCmdBluffUsage: () => `❌ Usage: \`BLUFF <role1>, <role2>, <role3>\``,
  draftCmdAssignUsage: () =>
    `❌ Usage: \`ASSIGN\` followed by one \`<player>: <role>\` per line, then \`CONFIRM\`.`,
  draftCmdRoleError: (msg) => `❌ ${msg}`,
  draftCmdValidationError: (msg) => `❌ Validation error: ${msg}`,
  draftCmdHerringNotGood: () =>
    `❌ Red Herring must be a non-Demon Good player.`,
  draftCmdHerringNoFT: () =>
    `❌ Fortune Teller is not in play — HERRING command is not applicable.`,
  draftCmdDrunkNotInPlay: () =>
    `❌ Drunk is not in play — DRUNK command is not applicable.`,
  draftCmdDrunkNotTownsfolk: (name) => `❌ "${name}" is not a Townsfolk role.`,
  draftCmdDrunkAlreadyAssigned: (name) =>
    `❌ "${name}" is already assigned to a real player.`,
  draftCmdBluffNoImp: () =>
    `❌ Imp is not in play — BLUFF command is not applicable.`,
  draftCmdBluffNotTownsfolk: (name) => `❌ "${name}" is not a Townsfolk role.`,
  draftCmdBluffAlreadyAssigned: (name) =>
    `❌ "${name}" is already assigned to a real player.`,
  draftCmdBluffDuplicate: () => `❌ All three bluff roles must be distinct.`,
  draftCmdAssignParseError: (line) =>
    `❌ Cannot parse assignment line: "${line}". Expected format: \`<player>: <role>\``,
  draftCmdAssignPlayerCount: (got, want) =>
    `❌ ASSIGN block has ${got} player assignment(s) but the game has ${want} players.`,
  draftConfirmed: () => `✅ The seal is set. Fates sent into the night…`,

  // Language
  langSet: (lang) => `✅ Language set to **${lang}**.`,
  langUnknown: (lang) =>
    `❌ Unknown language: "${lang}". Available: \`en\`, \`zh\`.`,

  // Rulebook
  rulebookListTitle: () =>
    `📖 **Trouble Brewing — Role List**  |  Use \`/rulebook role:<name>\` for a detailed rules reminder`,
  rulebookListFooter: () =>
    `Role names in English or Chinese are both accepted.`,
  rulebookRoleNotFound: (name) =>
    `❌ Unknown role: "${name}". Use \`/rulebook\` (no argument) to see all roles.`,
};
