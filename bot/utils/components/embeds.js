import { EmbedBuilder } from 'discord.js';

import { COLORS, ASSETS } from '../../config/theme.js';

export function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle('Welcome to amis.!')
    .setDescription('Click on the button below to gain access.')
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({ text: 'amis.', iconURL: ASSETS.LOGO_URL });
}

export function buildSayEmbedEmbed(msgContent, options = {}) {
  const {
    header,
    colorKey = 'green',
    includeThumb = false,
    includeBanner = false,
  } = options;

  const colorMap = {
    red: COLORS.ALERT_RED,
    green: COLORS.VERIFIED_GREEN,
    blue: COLORS.BLURPLE,
    yellow: 0xf1c40f,
  };

  const embed = new EmbedBuilder()
    .setDescription(msgContent)
    .setColor(colorMap[colorKey])
    .setFooter({ text: 'amis.', iconURL: ASSETS.LOGO_URL });

  if (header) embed.setTitle(header);
  if (includeThumb) embed.setThumbnail(ASSETS.LOGO_URL);
  if (includeBanner) embed.setImage(ASSETS.BANNER_URL);

  return embed;
}

export function buildSayDmEmbed(msgContent, msgTitle, embedTitle, thumbnail) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle(embedTitle)
    .setThumbnail(thumbnail);

  if (msgTitle) {
    embed.addFields({ name: msgTitle, value: msgContent });
  } else {
    embed.setDescription(msgContent);
  }

  return embed;
}

export function buildTradeEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle('Start a Secure Trade')
    .setDescription(
      "Ready to trade? I'll help you create a secure transaction for you and your partner. Click below to begin.",
    )
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({
      text: 'amis.',
      iconURL: ASSETS.LOGO_URL,
    });
}

export function buildSubmitTradeDetailsEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle('Submit Trade Details')
    .setDescription('Please click the button below to continue.')
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({
      text: 'amis.',
      iconURL: ASSETS.LOGO_URL,
    });
}
