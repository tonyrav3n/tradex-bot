import { SlashCommandBuilder } from "discord.js";

import { buildTradeButton, buildTradeEmbed } from "../utils/components.js";

export const data = new SlashCommandBuilder()
  .setName("create_trade")
  .setDescription("Send 'Create Trade' embed");

export async function execute(interaction) {
  await interaction.reply({
    embeds: [buildTradeEmbed()],
    components: [buildTradeButton()],
  });
}
