import { Role } from "./types";

export const ROLES: Role[] = [
  // ── Demon ────────────────────────────────────────────────────────────────
  {
    id: "imp",
    name: "Imp",
    nameZh: "小恶魔",
    category: "Demon",
    description:
      "Each night (except the first), choose a player to kill. " +
      "If you kill yourself, a Minion becomes the new Imp.",
    descriptionZh:
      "每晚（第一夜除外），选择一名玩家将其杀死。" +
      "若你选择杀死自己，一名爪牙将秘密成为新的小恶魔。",
  },

  // ── Minions ───────────────────────────────────────────────────────────────
  {
    id: "poisoner",
    name: "Poisoner",
    nameZh: "投毒者",
    category: "Minion",
    description:
      "Each night, choose a player to poison until dusk the following day. " +
      "Their ability malfunctions and the Storyteller may give them false information.",
    descriptionZh:
      "每晚选择一名玩家，该玩家中毒至次日黄昏。" +
      "其能力失效，说书人可给予虚假信息。",
  },
  {
    id: "spy",
    name: "Spy",
    nameZh: "间谍",
    category: "Minion",
    description:
      "Each night, you may view the Grimoire, learning the true role and status of all players. " +
      "You might register as Good to detection abilities, even if dead.",
    descriptionZh:
      "每晚可查看说书人手册，了解所有玩家的真实身份与状态。" +
      "对探查类能力，你可能被识别为善良阵营（即使死亡后仍可能）。",
  },
  {
    id: "scarlet_woman",
    name: "Scarlet Woman",
    nameZh: "红唇女郎",
    category: "Minion",
    description:
      "If the Demon dies while 5 or more players are alive, you immediately become the new Imp. " +
      "(Travellers don't count.)",
    descriptionZh:
      "若场上存活人数不少于5人时恶魔（小恶魔）死亡，你立即成为新的小恶魔。" +
      "（旅人不计入该人数阈值。）",
  },
  {
    id: "baron",
    name: "Baron",
    nameZh: "男爵",
    category: "Minion",
    description:
      "At the start of the game, 2 extra Outsiders are added and 2 Townsfolk are removed. " +
      "You have no night action.",
    descriptionZh:
      "游戏开始时，场上额外增加2名外来者，相应减少2名镇民。" +
      "你没有夜晚行动。",
  },

  // ── Townsfolk ─────────────────────────────────────────────────────────────
  {
    id: "washerwoman",
    name: "Washerwoman",
    nameZh: "洗衣妇",
    category: "Townsfolk",
    description:
      "On the first night, you learn that one of two players is a particular Townsfolk character. " +
      "The other player may be any role.",
    descriptionZh:
      "第一夜，你得知两名玩家中有一人是特定的镇民角色，另一人可以是任意身份。",
  },
  {
    id: "librarian",
    name: "Librarian",
    nameZh: "图书管理员",
    category: "Townsfolk",
    description:
      "On the first night, you learn that one of two players is a particular Outsider character. " +
      "If no Outsiders are in play, you learn that instead.",
    descriptionZh:
      "第一夜，你得知两名玩家中有一人是特定的外来者角色。若场上没有外来者，则得知该信息。",
  },
  {
    id: "investigator",
    name: "Investigator",
    nameZh: "调查员",
    category: "Townsfolk",
    description:
      "On the first night, you learn that one of two players is a particular Minion character.",
    descriptionZh: "第一夜，你得知两名玩家中有一人是特定的爪牙角色。",
  },
  {
    id: "chef",
    name: "Chef",
    nameZh: "厨师",
    category: "Townsfolk",
    description:
      "On the first night, you learn how many pairs of Evil players are sitting adjacent to each other.",
    descriptionZh: "第一夜，你得知场上邪恶玩家中相邻而坐的配对数量。",
  },
  {
    id: "empath",
    name: "Empath",
    nameZh: "共情者",
    category: "Townsfolk",
    description:
      "Each night, you learn how many of your two living neighbours (0, 1, or 2) belong to the Evil team.",
    descriptionZh:
      "每晚，你得知两侧存活邻居中有多少人属于邪恶阵营（0、1或2）。",
  },
  {
    id: "fortune_teller",
    name: "Fortune Teller",
    nameZh: "占卜师",
    category: "Townsfolk",
    description:
      "Each night, choose two players and learn whether either one is the Demon (yes/no). " +
      'One innocent Good player is your Red Herring — they also trigger a "yes" answer.',
    descriptionZh:
      "每晚选择两名玩家，得知其中是否有恶魔（是/否）。" +
      '一名无辜的善良玩家是你的"红鲱鱼"，选中红鲱鱼时同样得到"是"的答案。',
  },
  {
    id: "undertaker",
    name: "Undertaker",
    nameZh: "送葬者",
    category: "Townsfolk",
    description:
      "Each night (except the first), if a player was executed that day, you learn their true role.",
    descriptionZh:
      "每晚（第一夜除外），若当天有玩家被处决，你得知该玩家的真实身份。",
  },
  {
    id: "monk",
    name: "Monk",
    nameZh: "僧侣",
    category: "Townsfolk",
    description:
      "Each night (except the first), choose a player (not yourself). " +
      "That player cannot be killed by the Demon tonight.",
    descriptionZh:
      "每晚（第一夜除外），选择一名玩家（不能选自己），该玩家今晚不会被恶魔杀死。",
  },
  {
    id: "ravenkeeper",
    name: "Ravenkeeper",
    nameZh: "守鸦人",
    category: "Townsfolk",
    description:
      "If you are killed at night, you immediately choose a player and learn their true role.",
    descriptionZh: "若你在夜晚被杀，立即选择一名玩家，得知其真实身份。",
  },
  {
    id: "virgin",
    name: "Virgin",
    nameZh: "贞洁者",
    category: "Townsfolk",
    description:
      "The first time you are nominated, if the nominator is a Townsfolk, " +
      "they are immediately executed without a vote.",
    descriptionZh:
      "第一次被提名时，若提名者是镇民，该提名者立即被处决，无需投票。",
  },
  {
    id: "slayer",
    name: "Slayer",
    nameZh: "猎手",
    category: "Townsfolk",
    description:
      "Once per game, publicly choose a player during the day. " +
      "If they are the Demon, they die immediately.",
    descriptionZh:
      "每局游戏仅一次，在白天公开选择一名玩家。若该玩家是恶魔，其立即死亡。",
  },
  {
    id: "soldier",
    name: "Soldier",
    nameZh: "士兵",
    category: "Townsfolk",
    description:
      "The Demon cannot kill you at night. You can still be poisoned.",
    descriptionZh: "恶魔无法在夜晚杀死你。你仍可被投毒者中毒。",
  },
  {
    id: "mayor",
    name: "Mayor",
    nameZh: "镇长",
    category: "Townsfolk",
    description:
      "If only 3 players are alive and no execution occurs that day, the Good team wins immediately. " +
      "If the Demon targets you at night, the kill may be redirected to another player.",
    descriptionZh:
      "若存活人数恰好为3人且当天无人被处决，善良阵营立即获胜。" +
      "若恶魔在夜晚选择你，伤害可能被转移给另一名玩家。",
  },

  // ── Outsiders ─────────────────────────────────────────────────────────────
  {
    id: "butler",
    name: "Butler",
    nameZh: "管家",
    category: "Outsider",
    description:
      "Each night (starting night 1), secretly choose a player (not yourself) as your master. " +
      "The following day you may only vote if your master is also voting.",
    descriptionZh:
      "每晚（第一夜起），秘密选择一名其他玩家（不能选自己）作为主人。次日你只有在主人也投票时才能投票。",
  },
  {
    id: "drunk",
    name: "Drunk",
    nameZh: "酒鬼",
    category: "Outsider",
    description:
      "You do not know you are the Drunk. " +
      "You think you are a Townsfolk character, but your ability never works " +
      "and you may receive false information.",
    descriptionZh:
      "你不知道自己是酒鬼。你以为自己是一个镇民角色，但你的能力从不生效，" +
      "你收到的信息可能为虚假信息。",
  },
  {
    id: "recluse",
    name: "Recluse",
    nameZh: "陌客",
    category: "Outsider",
    description:
      "You might register as Evil or even as a specific Minion or Demon to detection abilities, even if dead, " +
      "even though you are Good. The Storyteller decides when this applies.",
    descriptionZh:
      "对探查类能力，你可能被识别为邪恶阵营，甚至被识别为特定的爪牙或恶魔身份（即使死亡后仍可能），" +
      "即使你是善良的。由说书人决定何时触发此效果。",
  },
  {
    id: "saint",
    name: "Saint",
    nameZh: "圣徒",
    category: "Outsider",
    description: "If you are executed, the Good team immediately loses.",
    descriptionZh: "若你被处决，善良阵营立即失败。",
  },
];

// Lookup helpers
export const ROLE_BY_ID = new Map<string, Role>(ROLES.map((r) => [r.id, r]));
export const ROLE_BY_NAME = new Map<string, Role>(
  ROLES.flatMap((r) => [
    [r.name.toLowerCase(), r],
    [r.nameZh, r],
  ]),
);

export const TOWNSFOLK = ROLES.filter((r) => r.category === "Townsfolk");
export const OUTSIDERS = ROLES.filter((r) => r.category === "Outsider");
export const MINIONS = ROLES.filter((r) => r.category === "Minion");
export const DEMONS = ROLES.filter((r) => r.category === "Demon");

/** Resolve a role from a user-supplied string (name or zh name, case-insensitive). */
export function findRole(input: string): Role | undefined {
  return (
    ROLE_BY_NAME.get(input.trim().toLowerCase()) ??
    ROLE_BY_NAME.get(input.trim())
  );
}
