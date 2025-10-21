import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("create_trade")
  .setDescription("Send 'Create Trade' embed");

function buildTradeButtons() {
  const createButton = new ButtonBuilder()
    .setCustomId("create_trade_flow_button")
    .setLabel("Create Trade")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(createButton);
  return row;
}

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor("#5865F2") // Discord blurple, clean and neutral
    .setTitle("🪙 TradeX")
    .setDescription("Ready to begin?\nClick below to create a trade.")
    .setFooter({ text: "Built for trustless digital trading." });

  await interaction.reply({
    embeds: [embed],
    components: [buildTradeButtons()],
  });
}
