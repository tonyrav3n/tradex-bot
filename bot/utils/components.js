import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

import { COLORS, ASSETS } from '../config/theme.js';

export function buildVerifyButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_assign_role')
      .setLabel('✅ Verify')
      .setStyle(ButtonStyle.Success),
  );
}

export function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle('👋 Welcome to amis.!')
    .setDescription('Click on the button below to gain access.')
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({ text: 'amis.', iconURL: ASSETS.LOGO_URL });
}
