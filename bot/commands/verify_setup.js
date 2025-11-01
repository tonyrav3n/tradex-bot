import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { isAdmin } from "../utils/roles.js";
import { buildVerifyButtonRow, buildVerifyEmbed } from "../utils/components.js";

export const data = new SlashCommandBuilder()
  .setName("verify_setup")
  .setDescription("Post a Verify button in a target channel (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to post the Verify button in")
      .setRequired(true),
  );

export async function execute(interaction) {
  // Admin-only guard (Administrator permission OR ADMIN_ROLE_ID env role)
  if (!isAdmin(interaction)) {
    return interaction.reply({
      content: "You don't have permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.options.getChannel("channel", true);

  // Validate channel is sendable
  if (!channel || typeof channel.send !== "function") {
    return interaction.reply({
      content:
        "The selected channel does not support sending messages. Please choose a text channel.",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const msg = await channel.send({
      embeds: [buildVerifyEmbed()],
      components: [buildVerifyButtonRow()],
    });

    return interaction.reply({
      content: `✅ Verify button posted in ${channel}. Link: ${msg.url}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("verify_setup failed:", err);
    const payload = {
      content:
        "❌ Failed to post the Verify button. Please check my permissions for the channel.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload);
    }
    return interaction.reply(payload);
  }
}
