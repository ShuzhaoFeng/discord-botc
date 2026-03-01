import { ChatInputCommandInteraction, Client } from "discord.js";
import { handleYe } from "../game/day";

export async function handleYeCommand(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  await handleYe(i, client);
}
