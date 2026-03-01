import { ChatInputCommandInteraction, Client } from "discord.js";
import { handleNominate } from "../game/day";

export async function handleNominateCommand(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  await handleNominate(i, client);
}
