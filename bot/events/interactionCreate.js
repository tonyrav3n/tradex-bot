import {
  Events,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { createTrade } from "../utils/createTrade.js";

const flows = new Map();

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(client, interaction) {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // Handle component interactions: buttons, selects, modals
    if (interaction.isButton()) {
      const uid = interaction.user.id;

      if (interaction.customId === "create_trade_button") {
        // Demo Trx flow (existing behavior)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Define trade participants (temp hardcoded for now)
        const buyer = "0x8748B8d799754DA4bD9B5640e444b59E957F8f8E";
        const seller = "0xe3378EE2b08284f5ac0c2695d4029E1C444beE6F";
        const amount = "0.001"; // example ETH amount — you can change this later

        try {
          // Call createTrade util (which interacts with the Factory contract)
          const txHash = await createTrade(buyer, seller, amount);

          await interaction.editReply({
            content: `✅ Trade successfully created!\n\n**Transaction hash:** ${txHash}`,
          });
        } catch (err) {
          console.error("Create trade error:", err);
          await interaction.editReply({
            content: `❌ Failed to create trade:\n\`${err.message}\``,
          });
        }
      } else if (interaction.customId === "create_trade_flow_button") {
        // Start multi-step Create Trade flow
        flows.set(uid, { initiatorId: uid });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("role_buyer")
            .setLabel("Buyer")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("role_seller")
            .setLabel("Seller")
            .setStyle(ButtonStyle.Primary),
        );
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({
          content: "What is your role in this trade?",
          components: [row],
        });
      } else if (
        interaction.customId === "role_buyer" ||
        interaction.customId === "role_seller"
      ) {
        const flow = flows.get(uid) || { initiatorId: uid };
        flow.role = interaction.customId === "role_buyer" ? "buyer" : "seller";
        flows.set(uid, flow);

        const select = new UserSelectMenuBuilder()
          .setCustomId("select_counterparty")
          .setPlaceholder("Who's the counterparty?")
          .setMinValues(1)
          .setMaxValues(1);
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.deferUpdate();
        await interaction.editReply({
          content: "Select the counterparty:",
          components: [row],
        });
      } else if (interaction.customId === "create_thread") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const flow = flows.get(uid);
        if (!flow || !flow.role || !flow.counterpartyId || !flow.description) {
          return await interaction.editReply({
            content:
              "Trade details are incomplete. Please restart with Create Trade.",
          });
        }

        const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
        const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;

        // Build confirmation embed to seed the thread
        const embed = new EmbedBuilder()
          .setTitle("Trade Created")
          .setDescription("A private thread has been created for this trade.")
          .addFields(
            { name: "Buyer", value: `<@${buyerId}>`, inline: true },
            { name: "Seller", value: `<@${sellerId}>`, inline: true },
            { name: "Item", value: flow.description, inline: false },
          )
          .setColor(0x2ecc71);

        // Create a private thread in the current channel
        const threadName = `trade-${uid.slice(-4)}-${flow.counterpartyId.slice(-4)}`;
        const thread = await interaction.channel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
        });

        // Invite both parties
        await thread.members.add(buyerId).catch(() => {});
        await thread.members.add(sellerId).catch(() => {});

        await thread.send({
          content: `Welcome <@${buyerId}> and <@${sellerId}>`,
          embeds: [embed],
        });

        await interaction.editReply({
          content: `✅ Private thread created: <#${thread.id}>`,
        });

        // Clear flow
        flows.delete(uid);
      }
    }

    // Handle user select for counterparty
    if (
      interaction.isUserSelectMenu &&
      interaction.isUserSelectMenu() &&
      interaction.customId === "select_counterparty"
    ) {
      const uid = interaction.user.id;
      const flow = flows.get(uid) || { initiatorId: uid };
      const [counterpartyId] = interaction.values;
      flow.counterpartyId = counterpartyId;
      flows.set(uid, flow);

      // Show description modal
      const modal = new ModalBuilder()
        .setCustomId("trade_description_modal")
        .setTitle("Trade Item Description");
      const input = new TextInputBuilder()
        .setCustomId("trade_description")
        .setLabel("Describe the item")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);
      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
      await interaction.showModal(modal);
    }

    // Handle modal submit for description
    if (
      interaction.isModalSubmit &&
      interaction.isModalSubmit() &&
      interaction.customId === "trade_description_modal"
    ) {
      const uid = interaction.user.id;
      const flow = flows.get(uid) || { initiatorId: uid };
      const description =
        interaction.fields.getTextInputValue("trade_description");
      flow.description = description;
      flows.set(uid, flow);

      const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
      const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;

      const embed = new EmbedBuilder()
        .setTitle("Confirm Trade Details")
        .addFields(
          { name: "Buyer", value: `<@${buyerId}>`, inline: true },
          { name: "Seller", value: `<@${sellerId}>`, inline: true },
          { name: "Item", value: description, inline: false },
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_thread")
          .setLabel("Create Private Thread")
          .setStyle(ButtonStyle.Success),
      );

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({
        content: "Review the details and proceed to invite the counterparty.",
        embeds: [embed],
        components: [row],
      });
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "There was an error handling your interaction.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
