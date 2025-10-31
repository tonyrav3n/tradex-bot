import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { isAdmin } from "../utils/roles.js";
import { COLORS } from "../utils/theme.js";

export const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Sends a message to a channel, embeds, or DM. (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  // /say message
  .addSubcommand((sub) =>
    sub
      .setName("message")
      .setDescription("Sends message to specified channel. (Admin only)")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("What channel should I send this message to?")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Input message content.")
          .setRequired(true),
      ),
  )
  // /say embed
  .addSubcommand((sub) =>
    sub
      .setName("embed")
      .setDescription(
        "Sends embedded message to specified channel. (Admin only)",
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription(
            "What channel should I send this embedded message to?",
          )
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Input message content.")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("header").setDescription("Input header content."),
      )
      .addStringOption((opt) =>
        opt
          .setName("color")
          .setDescription("Select colour. (Default: Green)")
          .addChoices(
            { name: "🟥 Red", value: "red" },
            { name: "🟩 Green", value: "green" },
            { name: "🟦 Blue (Blurple)", value: "blue" },
            { name: "🟨 Yellow", value: "yellow" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("thumbnail_url")
          .setDescription("Optional thumbnail image URL."),
      )
      .addStringOption((opt) =>
        opt.setName("image_url").setDescription("Optional main image URL."),
      )
      .addStringOption((opt) =>
        opt.setName("footer_text").setDescription("Optional footer text."),
      )
      .addStringOption((opt) =>
        opt
          .setName("footer_icon_url")
          .setDescription("Optional footer icon URL."),
      ),
  )
  // /say dm
  .addSubcommand((sub) =>
    sub
      .setName("dm")
      .setDescription(
        "Sends a direct message to specified member. (Admin only)",
      )
      .addUserOption((opt) =>
        opt
          .setName("member")
          .setDescription("Which member should I send direct message to?")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Input message content.")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Input title."),
      ),
  );

export async function execute(interaction) {
  // Admin-only guard supporting Administrator perm OR ADMIN_ROLE_ID in env
  if (!isAdmin(interaction)) {
    return interaction.reply({
      content: "You don't have permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand(true);

  try {
    if (sub === "message") {
      const channel = interaction.options.getChannel("channel", true);
      const msgContent = interaction.options.getString("message", true);

      const sent = await channel.send({ content: msgContent });
      return interaction.reply({
        content: `Message sent to ${channel} successfully! Link: ${sent.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "embed") {
      const channel = interaction.options.getChannel("channel", true);
      const msgContent = interaction.options.getString("message", true);
      const header = interaction.options.getString("header") || undefined;
      const colorKey = interaction.options.getString("color") || "green";
      const thumbnailUrl =
        interaction.options.getString("thumbnail_url") || undefined;
      const imageUrl = interaction.options.getString("image_url") || undefined;
      const footerText =
        interaction.options.getString("footer_text") || undefined;
      const footerIcon =
        interaction.options.getString("footer_icon_url") || undefined;

      const colorMap = {
        red: COLORS.ALERT_RED,
        green: COLORS.VERIFIED_GREEN,
        blue: COLORS.BLURPLE,
        yellow: 0xf1c40f,
      };

      const embed = new EmbedBuilder()
        .setDescription(msgContent)
        .setColor(colorMap[colorKey] || COLORS.VERIFIED_GREEN);
      if (header) embed.setTitle(header);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      if (imageUrl) embed.setImage(imageUrl);
      if (footerText || footerIcon)
        embed.setFooter({
          text: footerText || "",
          iconURL: footerIcon || undefined,
        });

      const sent = await channel.send({ embeds: [embed] });
      return interaction.reply({
        content: `Message sent to ${channel} successfully! Link: ${sent.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "dm") {
      const member = interaction.options.getMember("member");
      const user = member?.user ?? interaction.options.getUser("member", true);
      const msgContent = interaction.options.getString("message", true);
      const title = interaction.options.getString("title") || undefined;

      const embed = new EmbedBuilder()
        .setColor(Colors.DarkGrey)
        .setTitle(`Message from ${interaction.guild?.name ?? "Server"}`)
        .addFields({ name: title || "Message", value: msgContent })
        .setThumbnail(interaction.guild?.iconURL() ?? null);

      await user.send({ embeds: [embed] });
      return interaction.reply({
        content: `Message sent to ${user} successfully!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Fallback
    return interaction.reply({
      content: "Unknown subcommand.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`Error in /say ${sub}:`, err);
    const payload = {
      content: "An error occurred while sending the message.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload);
    }
    return interaction.reply(payload);
  }
}
