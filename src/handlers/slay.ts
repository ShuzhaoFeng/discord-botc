import { ChatInputCommandInteraction, Client } from "discord.js";
import { handleSlay } from "../game/day";

export async function handleSlayCommand(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  await handleSlay(i, client);
}
