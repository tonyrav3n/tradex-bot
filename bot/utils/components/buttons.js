import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function buildVerifyButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_assign_role')
      .setLabel('✅ Verify')
      .setStyle(ButtonStyle.Success),
  );
}
