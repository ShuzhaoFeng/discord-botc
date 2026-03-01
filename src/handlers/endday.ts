import { ChatInputCommandInteraction, Client } from "discord.js";
import { handleEndDay } from "../game/day";

export async function handleEnddayCommand(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  await handleEndDay(i, client);
}
