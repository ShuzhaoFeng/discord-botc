import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChatInputCommandInteraction,
} from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

import { isClockTowerCommand, handleClockTower } from "./handlers/clocktower";
import { isCtestCommand, handleCtest } from "./handlers/clocktower_test";
import {
  isImpersonateCommand,
  handleImpersonate,
} from "./handlers/impersonate";
import { handleIam } from "./handlers/iam";
import { handleYouare } from "./handlers/youare";
import { handleNightDm } from "./handlers/night_dm";
import { handleLang } from "./handlers/lang";
import { handleRulebook } from "./handlers/rulebook";
import { handleNominateCommand } from "./handlers/nominate";
import { handleYeCommand } from "./handlers/ye";
import { handleRoleCommand } from "./game/roleCommands";
import { handleEnddayCommand } from "./handlers/endday";
import { handleInfo } from "./handlers/info";
import { handleLink } from "./handlers/link";
import { startUiServer } from "./ui/server";
import { getGame } from "./game/state";
import { areChannelCommandsDisabled } from "./game/utils";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Privileged intent — required for !clocktower parsing
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel, // Required for DM channels
    Partials.Message,
  ],
});

// ─── Ready ─────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

// ─── Slash commands ────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const i = interaction as ChatInputCommandInteraction;

  try {
    switch (i.commandName) {
      case "iam":
        await handleIam(i, client);
        break;
      case "youare":
        await handleYouare(i, client);
        break;
      case "lang":
        await handleLang(i);
        break;
      case "rulebook":
        await handleRulebook(i);
        break;
      case "nominate":
      case "ye":
      case "endday": {
        const gameState = getGame(i.channelId);
        if (gameState && areChannelCommandsDisabled(gameState)) break;
        if (i.commandName === "nominate")
          await handleNominateCommand(i, client);
        else if (i.commandName === "ye") await handleYeCommand(i, client);
        else await handleEnddayCommand(i, client);
        break;
      }
      case "info":
        await handleInfo(i);
        break;
      case "link":
        await handleLink(i);
        break;
      default:
        if (!(await handleRoleCommand(i, client))) {
          console.warn(`Unrecognized command: /${i.commandName}`);
        }
    }
  } catch (err) {
    console.error(`Error handling /${i.commandName}:`, err);
    const errorMsg = "❌ An unexpected error occurred. Please try again.";
    if (i.replied || i.deferred) {
      await i.followUp({ content: errorMsg, ephemeral: true }).catch(() => {});
    } else {
      await i.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
    }
  }
});

// ─── Message commands ──────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    try {
      await handleNightDm(message, client);
    } catch (err) {
      console.error("Error handling DM:", err);
    }
    return;
  }

  if (isImpersonateCommand(message.content)) {
    try {
      await handleImpersonate(message, client);
    } catch (err) {
      console.error("Error handling !as:", err);
    }
  } else if (isCtestCommand(message.content)) {
    try {
      await handleCtest(message);
    } catch (err) {
      console.error("Error handling !ctest:", err);
      await message
        .reply(
          "❌ An unexpected error occurred while setting up the test game.",
        )
        .catch(() => {});
    }
  } else if (isClockTowerCommand(message.content)) {
    try {
      await handleClockTower(message);
    } catch (err) {
      console.error("Error handling !clocktower:", err);
      await message
        .reply("❌ An unexpected error occurred while setting up the game.")
        .catch(() => {});
    }
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ DISCORD_TOKEN is not set in .env");
  process.exit(1);
}

client.login(token);

const uiPort = parseInt(process.env.UI_PORT ?? "3000", 10);
startUiServer(client, uiPort).catch((err) => {
  console.error("❌ Failed to start Admin UI server:", err);
});
