import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

import { buildTradeButton, buildTradeEmbed } from "../utils/components.js";
import { isAdmin } from "../utils/roles.js";

export const data = new SlashCommandBuilder()
  .setName("create_trade")
  .setDescription("Send 'Create Trade' embed")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const allowed = isAdmin(interaction);

  if (!allowed) {
    await interaction.reply({
      content: "This command is restricted to admins.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [buildTradeEmbed()],
    components: [buildTradeButton()],
  });
}
