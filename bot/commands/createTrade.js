import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("create_trade")
  .setDescription("Send 'Demo Trx' and 'Create Trade' buttons");

function buildTradeButtons() {
  const demoButton = new ButtonBuilder()
    .setCustomId("create_trade_button")
    .setLabel("Demo Trx")
    .setStyle(ButtonStyle.Secondary);

  const createButton = new ButtonBuilder()
    .setCustomId("create_trade_flow_button")
    .setLabel("Create Trade")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(demoButton, createButton);
  return row;
}

export async function execute(interaction) {
  await interaction.reply({
    content: "Choose an option below:",
    components: [buildTradeButtons()],
  });
}
