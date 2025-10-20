import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("create_trade")
  .setDescription("Send a green 'Create Trade' button");

function buildCreateTradeButton() {
  const button = new ButtonBuilder()
    .setCustomId("create_trade_button")
    .setLabel("Create Trade")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);
  return row;
}

export async function execute(interaction) {
  await interaction.reply({
    content: "Click the button below to create a trade:",
    components: [buildCreateTradeButton()],
  });
}
