/**
 * One-time script to register slash commands with Discord.
 * Run with: npm run deploy
 */

import { REST, Routes, SlashCommandBuilder } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;
const guildId = process.env.DISCORD_GUILD_ID;

const commands = [
  new SlashCommandBuilder()
    .setName("iam")
    .setDescription("Claim the Storyteller role and enable Manual Mode.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("youare")
    .setDescription("Let the bot act as Storyteller in Automated Mode.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("lang")
    .setDescription("Set your language preference for bot messages.")
    .addStringOption((opt) =>
      opt
        .setName("language")
        .setDescription(
          'Language code: "en" (English) or "zh" (Simplified Chinese)',
        )
        .setRequired(true)
        .addChoices(
          { name: "English", value: "en" },
          { name: "简体中文", value: "zh" },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rulebook")
    .setDescription("Look up Trouble Brewing roles. Omit role for a full list.")
    .addStringOption((opt) =>
      opt
        .setName("role")
        .setDescription(
          'Role name in English or Chinese (e.g. "Imp", "小恶魔")',
        )
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("whosleft")
    .setDescription(
      "Manual mode only: show which players still owe a night reply.",
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("nominate")
    .setDescription("Nominate a living player for execution (day phase).")
    .addStringOption((opt) =>
      opt
        .setName("player")
        .setDescription("Name of the player to nominate")
        .setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ye")
    .setDescription("Vote for the currently nominated player (day phase).")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("slay")
    .setDescription("Claim to be the Slayer and attempt to slay a player (day phase).")
    .addStringOption((opt) =>
      opt
        .setName("player")
        .setDescription("Name of the player to slay")
        .setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("endday")
    .setDescription("Vote to end the day, or (Storyteller) end it immediately.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show game info: phase, role distribution, win conditions, and player status.")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands…");

    if (guildId) {
      // Guild-specific (instant, good for development).
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(
        `✅ Registered ${commands.length} guild command(s) in guild ${guildId}.`,
      );
    } else {
      // Global (takes up to 1 hour to propagate).
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Registered ${commands.length} global command(s).`);
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
    process.exit(1);
  }
})();
