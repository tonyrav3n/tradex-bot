import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  InteractionContextType,
  ChannelType,
} from 'discord.js';

import { buildVerifyButtonRow, buildVerifyEmbed } from '../utils/components.js';

export const data = new SlashCommandBuilder()
  .setName('verify_setup')
  .setDescription('Post a Verify button in a target channel (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild])
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Channel to post the Verify button in')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel('channel', true);

  try {
    const msg = await channel.send({
      embeds: [buildVerifyEmbed()],
      components: [buildVerifyButtonRow()],
    });

    return interaction.editReply({
      content: `✅ Verify button posted in ${channel}. Link: ${msg.url}`,
    });
  } catch (err) {
    console.error('verify_setup failed:', err);
    return interaction
      .editReply({
        content:
          '❌ Failed to post the Verify button. Please check my permissions for the channel.',
      })
      .catch((replyErr) =>
        console.error('Failed to send error message:', replyErr),
      );
  }
}
