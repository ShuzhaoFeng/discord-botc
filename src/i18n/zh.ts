import { Messages } from "./en";

export const ROLE_GUIDE_ZH: Record<string, string> = {
  imp:
    `**规则提示：**\n` +
    `• 每晚（首夜除外）选择一名玩家：其死亡。\n` +
    `• 若你以此方式选择自己，你死亡，一名存活爪牙成为小恶魔。\n` +
    `• 你知道3个不在本局游戏中的虚张声势角色；必要时可以声称自己是其中之一。\n` +
    `• 在本剧本中，你是恶魔角色。`,
  poisoner:
    `**规则提示：**\n` +
    `• 每晚选择一名玩家：其“今晚+明天白天”中毒。\n` +
    `• 中毒期间该玩家能力无效。\n` +
    `• 中毒状态在次日黄昏结束。`,
  spy:
    `**规则提示：**\n` +
    `• 每晚查看说书人手册。\n` +
    `• 对相关能力，你可能显示为善良阵营。\n` +
    `• 对相关能力，你可能显示为镇民或外来者（即使死亡后）。`,
  scarlet_woman:
    `**规则提示：**\n` +
    `• 若恶魔死亡且存活人数不少于5人，你成为恶魔。\n` +
    `• 该阈值不计入旅人。\n` +
    `• 若未触发该条件，恶魔死亡按常规结算。`,
  baron:
    `**规则提示：**\n` +
    `• 开局时外来者+2、镇民-2。\n` +
    `• 该人数调整不会因你死亡而撤销。\n` +
    `• 只有你和知晓男爵存在的玩家知道这些信息。`,
  washerwoman:
    `**规则提示：**\n` +
    `• 首夜你会看到两名玩家与一个镇民角色名。\n` +
    `• 这两名玩家中，恰有一人是该角色。\n` +
    `• 你只获得这一次信息，之后不再获得新信息。`,
  librarian:
    `**规则提示：**\n` +
    `• 首夜你会看到两名玩家与一个外来者角色名。\n` +
    `• 这两名玩家中，恰有一人是该角色。\n` +
    `• 若场上无外来者，你会得知“0名外来者在场”。\n` +
    `• 你只获得这一次信息，之后不再获得新信息。`,
  investigator:
    `**规则提示：**\n` +
    `• 首夜你会看到两名玩家与一个爪牙角色名。\n` +
    `• 这两名玩家中，恰有一人是该角色。\n` +
    `• 你只获得这一次信息，之后不再获得新信息。`,
  chef:
    `**规则提示：**\n` +
    `• 首夜你得知“相邻邪恶玩家配对数”。\n` +
    `• 例如连续3名邪恶算2对，连续4名邪恶算3对。\n` +
    `• 你只获得这一次信息，之后不再获得新信息。`,
  empath:
    `**规则提示：**\n` +
    `• 每晚你会得知两侧“存活邻居”里有几名邪恶（0/1/2）。\n` +
    `• 若邻座已死亡，则改看该方向最近的存活玩家。\n` +
    `• 你在存活期间每晚都会获得此信息。`,
  fortune_teller:
    `**规则提示：**\n` +
    `• 每晚选择2名玩家，得知其中是否至少一人为恶魔（是/否）。\n` +
    `• 会有1名善良玩家作为固定“红鲱鱼”，查验时也会出现“是”。\n` +
    `• 你可选择活人、死人，也可选择自己。`,
  undertaker:
    `**规则提示：**\n` +
    `• 每晚（首夜除外），你会得知当天被处决者的角色。\n` +
    `• 若当天无人被处决，则你当夜不获得该信息。\n` +
    `• 你在存活期间每个适用夜晚都会结算此能力。`,
  monk:
    `**规则提示：**\n` +
    `• 每晚（首夜除外）选择1名玩家（不能选自己）。\n` +
    `• 该玩家今夜不会被恶魔杀死。\n` +
    `• 你在存活期间每个适用夜晚都可选择一次。`,
  ravenkeeper:
    `**规则提示：**\n` +
    `• 若你在夜晚死亡，你会被唤醒并选择1名玩家。\n` +
    `• 你会得知该玩家的真实角色。\n` +
    `• 若你被白天处决，该能力不触发。`,
  virgin:
    `**规则提示：**\n` +
    `• 你第一次被提名时，需要检查提名者是否为镇民。\n` +
    `• 若提名者是镇民，提名者立刻被处决。\n` +
    `• 该效果仅会触发一次。`,
  slayer:
    `**规则提示：**\n` +
    `• 每局一次，你可在白天公开选择1名玩家。\n` +
    `• 若该玩家是恶魔，则其立刻死亡。\n` +
    `• 若该玩家不是恶魔，则无事发生。`,
  soldier:
    `**规则提示：**\n` +
    `• 你对恶魔是安全的。\n` +
    `• 恶魔不能在夜晚杀死你。\n` +
    `• 这不阻止中毒或白天处决。`,
  mayor:
    `**规则提示：**\n` +
    `• 若仅剩3名存活且当天无人处决，你的阵营获胜。\n` +
    `• 若你在夜晚死亡，可能改为另一名玩家死亡。\n` +
    `• 你是镇民角色。`,
  butler:
    `**规则提示：**\n` +
    `• 每晚选择一名玩家作为“主人”（不能选自己）。\n` +
    `• 次日只有在主人也投票时，你才能投票。\n` +
    `• 你在存活期间每晚都要重新选择。`,
  drunk:
    `**规则提示：**\n` +
    `• 你不知道自己是酒鬼。\n` +
    `• 你会以为自己是某个镇民角色，但实际上不是。\n` +
    `• 你按“以为的角色”获得的信息可能为假。`,
  recluse:
    `**规则提示：**\n` +
    `• 对探查能力，你可能显示为邪恶阵营。\n` +
    `• 你也可能显示为特定爪牙或恶魔。\n` +
    `• 该显示效果即使在你死亡后仍可能出现。`,
  saint:
    `**规则提示：**\n` +
    `• 若你被处决，你的阵营立即失败。\n` +
    `• 这是一个带有失败条件的外来者能力。\n` +
    `• 夜晚死亡不会触发该失败条件。`,
};

export const zh: Messages = {
  // Errors
  errorPlayerCount: (n) => `❌ 玩家人数无效（${n}人）。请提及 5 至 16 名玩家。`,
  errorPlayerCountMin5: () => `❌ 玩家人数不足。开始游戏至少需要 5 名玩家。`,
  errorPlayerCountMax16: () =>
    `❌ 玩家人数过多。最多允许 16 人（含可能的说书人）。`,
  errorNotGameChannel: () => `❌ 此命令只能在活跃的游戏频道中使用。`,
  errorAlreadyDecided: () => `❌ 本局游戏的说书人已经确定。`,
  errorIamNeedsSix: () =>
    `❌ 本局游戏仅有 5 人。使用 \`/iam\` 后将只剩 4 名玩家，低于最低人数要求（5人）。请使用 \`/youare\`。`,
  errorYouareNeedsFifteen: () =>
    `❌ 本局游戏共有 16 人。自动模式最多支持 15 名玩家，无法处理 16 人局。请使用 \`/iam\` 指定一名说书人。`,
  errorNotStoryteller: () =>
    `❌ 只有说书人才能在角色分配阶段通过私信发送命令。`,
  errorNoActiveGame: () => `❌ 未找到与您当前说书人会话对应的活跃游戏。`,
  errorAlreadyConfirmed: () => `❌ 草稿已确认，不接受任何进一步修改。`,

  // Game setup
  gameCreating: (players) =>
    `阴云为 ${players.join("、")} 汇聚……命运之地即将开启。`,
  gameChannelReady: (gameId, players) =>
    `🏰 **${gameId} 的命运即将揭晓。**\n\n灵魂已齐聚：${players.join("、")}\n\n谁将引领他们穿越长夜？`,
  chooseStoryteller: () =>
    `以 \`/iam\` 挺身担任说书人，或以 \`/youare\` 将命运交付时钟塔。`,

  // Storyteller decision
  iamAccepted: (username) =>
    `🎭 **${username}** 落座说书人之椅。命运的织机握于凡人之手——游戏以**手动模式**降临。\n命运草稿已低语至说书人的私信。`,
  youareAccepted: () =>
    `🌑 时钟塔钟声响起。**自动模式**已启动。说书人由命运亲自降临。`,

  // Role assignment
  rolesDistributed: () =>
    `✅ 命运已铸定。每个灵魂都怀揣秘密——长夜将近。`,
  roleDmHeader: (gameId) => `🕯️ **你的命运 — ${gameId}**`,
  roleDmRole: (roleName, category) =>
    `**${roleName}**  ·  *${category}*`,
  roleDmAbility: (description) => `**能力：** ${description}`,
  roleDmBeginnerGuide: (roleId) =>
    ROLE_GUIDE_ZH[roleId] ??
    `**一言指引：**\n• 侧耳倾听，如实分享，与同伴并肩而战。`,
  roleDmDrunkNote: (_fakeName) =>
    `*（你行走于迷雾中——你以为自己是这个镇民角色，但你的能力从不生效，你所听到的可能是谎言。）*`,
  roleDmImpBluffs: (b1, b2, b3) =>
    `🃏 **你可戴上的无辜面具**：${b1}、${b2}、${b3}`,
  roleDmImpMinions: (minions) => `👥 **俯首听命的爪牙**：${minions}`,
  roleDmMinionDemon: (demon) => `🩸 **你所效忠的主宰**：${demon}`,
  roleDmMinionPeers: (peers) => `👥 **与你同行暗夜的同袍**：${peers}`,

  // Draft
  draftHeader: (gameId) => `📜 **角色分配草稿** — ${gameId}`,
  draftTableHeader: () =>
    `\`\`\`\n玩家                 角色                 类型\n${"─".repeat(54)}\n`,
  draftRedHerring: (playerName) => `🔮 红鲱鱼（占卜师）：${playerName}`,
  draftImpBluffs: (r1, r2, r3) => `🃏 小恶魔虚张声势角色：${r1}、${r2}、${r3}`,
  draftCommands: () =>
    [
      `命令（每行一条），以 CONFIRM 结束：`,
      `• \`SWAP <玩家1> <玩家2>\`                    — 交换两名玩家的角色`,
      `• \`ROLE <玩家> <新角色>\`                    — 替换玩家角色（需同类别；男爵规则见说明）`,
      `• \`HERRING <玩家>\`                          — 更改占卜师的红鲱鱼`,
      `• \`DRUNK <角色>\`                            — 更改酒鬼的虚假身份`,
      `• \`BLUFF <角色1>, <角色2>, <角色3>\`         — 更改小恶魔的虚张声势角色`,
      `• \`ASSIGN\`（块）                            — 重新分配全部角色（每行格式：玩家: 角色，以 CONFIRM 结束）`,
      `• \`CONFIRM\`                                 — 确认并向所有玩家发送角色`,
    ].join("\n"),
  draftAdjusted: (note) => `⚙️ ${note}`,

  // Draft command errors
  draftCmdUnknownPlayer: (name) => `❌ 未知玩家："${name}"。`,
  draftCmdUnknownRole: (name) => `❌ 未知角色："${name}"。`,
  draftCmdAmbiguousPlayer: (name) =>
    `❌ 玩家名称不明确："${name}"，请使用完整用户名。`,
  draftCmdSwapUsage: () => `❌ 用法：\`SWAP <玩家1> <玩家2>\``,
  draftCmdRoleUsage: () => `❌ 用法：\`ROLE <玩家> <新角色>\``,
  draftCmdHerringUsage: () => `❌ 用法：\`HERRING <玩家>\``,
  draftCmdDrunkUsage: () => `❌ 用法：\`DRUNK <角色>\``,
  draftCmdBluffUsage: () => `❌ 用法：\`BLUFF <角色1>, <角色2>, <角色3>\``,
  draftCmdAssignUsage: () =>
    `❌ 用法：\`ASSIGN\` 后接每行一个 \`<玩家>: <角色>\`，最后以 \`CONFIRM\` 结束。`,
  draftCmdRoleError: (msg) => `❌ ${msg}`,
  draftCmdValidationError: (msg) => `❌ 验证错误：${msg}`,
  draftCmdHerringNotGood: () => `❌ 红鲱鱼必须是非恶魔的善良玩家。`,
  draftCmdHerringNoFT: () => `❌ 占卜师不在局中——HERRING 命令不适用。`,
  draftCmdDrunkNotInPlay: () => `❌ 酒鬼不在局中——DRUNK 命令不适用。`,
  draftCmdDrunkNotTownsfolk: (name) => `❌ "${name}" 不是镇民角色。`,
  draftCmdDrunkAlreadyAssigned: (name) => `❌ "${name}" 已被分配给真实玩家。`,
  draftCmdBluffNoImp: () => `❌ 小恶魔不在局中——BLUFF 命令不适用。`,
  draftCmdBluffNotTownsfolk: (name) => `❌ "${name}" 不是镇民角色。`,
  draftCmdBluffAlreadyAssigned: (name) => `❌ "${name}" 已被分配给真实玩家。`,
  draftCmdBluffDuplicate: () => `❌ 三个虚张声势角色必须各不相同。`,
  draftCmdAssignParseError: (line) =>
    `❌ 无法解析分配行："${line}"。格式应为：\`<玩家>: <角色>\``,
  draftCmdAssignPlayerCount: (got, want) =>
    `❌ ASSIGN 块包含 ${got} 条玩家分配，但游戏共有 ${want} 名玩家。`,
  draftConfirmed: () => `✅ 封印已落。命运已散入长夜……`,

  // Language
  langSet: (lang) => `✅ 语言已设置为 **${lang}**。`,
  langUnknown: (lang) => `❌ 未知语言："${lang}"。可用选项：\`en\`、\`zh\`。`,

  // Rulebook
  rulebookListTitle: () =>
    `📖 **试炼酿造 — 角色列表**  |  使用 \`/rulebook role:<角色名>\` 查看详细规则提示`,
  rulebookListFooter: () => `角色名称可使用中文或英文。`,
  rulebookRoleNotFound: (name) =>
    `❌ 未知角色："${name}"。不带参数使用 \`/rulebook\` 可查看全部角色。`,
};
