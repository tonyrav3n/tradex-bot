import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from 'discord.js';

import {
  buildSayDmEmbed,
  buildSayEmbedEmbed,
} from '../utils/components/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Send messages or embeds to channels or DMs')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild])

  // /say message
  .addSubcommand((sub) =>
    sub
      .setName('message')
      .setDescription('Sends message to specified channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('What channel should I send this message to?')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('Input message content')
          .setRequired(true),
      ),
  )

  // /say embed
  .addSubcommand((sub) =>
    sub
      .setName('embed')
      .setDescription('Sends embedded message to specified channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription(
            'What channel should I send this embedded message to?',
          )
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('Input message content')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('header').setDescription('Input header content'),
      )
      .addStringOption((opt) =>
        opt
          .setName('color')
          .setDescription('Select colour (Default: Green)')
          .addChoices(
            { name: '🟥 Red', value: 'red' },
            { name: '🟩 Green', value: 'green' },
            { name: '🟦 Blue', value: 'blue' },
            { name: '🟨 Yellow', value: 'yellow' },
          ),
      )
      .addBooleanOption((opt) =>
        opt
          .setName('include_thumbnail')
          .setDescription('Include logo thumbnail in the embed'),
      )
      .addBooleanOption((opt) =>
        opt
          .setName('include_banner')
          .setDescription('Include banner image in the embed'),
      ),
  )

  // /say dm
  .addSubcommand((sub) =>
    sub
      .setName('dm')
      .setDescription('Sends a direct message to specified member')
      .addUserOption((opt) =>
        opt
          .setName('member')
          .setDescription('Which member should I send direct message to?')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('Input message content')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Input title'),
      ),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sub = interaction.options.getSubcommand(true);

  try {
    if (sub === 'message') {
      const channel = interaction.options.getChannel('channel', true);
      const msgContent = interaction.options.getString('message', true);

      const sent = await channel.send({ content: msgContent });
      return interaction.editReply({
        content: `Message sent to ${channel} successfully! Link: ${sent.url}`,
      });
    }

    if (sub === 'embed') {
      const channel = interaction.options.getChannel('channel', true);
      const msgContent = interaction.options.getString('message', true);
      const header = interaction.options.getString('header') || undefined;
      const colorKey = interaction.options.getString('color') || 'green';
      const includeThumb =
        interaction.options.getBoolean('include_thumbnail') ?? false;
      const includeBanner =
        interaction.options.getBoolean('include_banner') ?? false;

      const embed = buildSayEmbedEmbed(msgContent, {
        header,
        colorKey,
        includeThumb,
        includeBanner,
      });

      const sent = await channel.send({ embeds: [embed] });
      return interaction.editReply({
        content: `Message sent to ${channel} successfully! Link: ${sent.url}`,
      });
    }

    if (sub === 'dm') {
      const member = interaction.options.getMember('member');
      const user = member?.user ?? interaction.options.getUser('member', true);
      const msgContent = interaction.options.getString('message', true);
      const msgTitle = interaction.options.getString('title');
      const embedTitle = `Message from ${interaction.guild.name}`;
      const thumbnail = interaction.guild.iconURL() ?? null;

      const embed = buildSayDmEmbed(
        msgContent,
        msgTitle,
        embedTitle,
        thumbnail,
      );

      try {
        await user.send({ embeds: [embed] });
        return interaction.editReply({
          content: `Message sent to ${user} successfully!`,
        });
      } catch (error) {
        if (error.code === 50007) {
          return interaction.editReply({
            content: `Cannot send DM to ${user} as their DMs are disabled.`,
          });
        }
        throw error;
      }
    }
  } catch (err) {
    console.error(`Error in /say ${sub}:`, err);

    return interaction.editReply({
      content: 'An error occurred while sending the message.',
    });
  }
}
