import { Events, MessageFlags, ChannelType } from "discord.js";
import { createTrade } from "../utils/createTrade.js";
import {
  startFlow,
  setFlow,
  getFlow,
  clearFlow,
  setPrice,
  markBuyerAgreed,
  markSellerAgreed,
  setBuyerAddress,
  setSellerAddress,
} from "../utils/flowState.js";
import {
  buildRoleButtonsRow,
  buildCounterpartySelectRow,
  buildDescriptionModal,
  buildConfirmationEmbed,
  buildCreateThreadRow,
  buildCreatedEmbed,
  buildAgreeRow,
  buildBuyerAddressModal,
  buildSellerAddressModal,
} from "../utils/components.js";
import { updateEphemeralOriginal } from "../utils/ephemeral.js";
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || "";

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
        startFlow(uid);
        setFlow(uid, { originalInteractionToken: interaction.token });
        const row = buildRoleButtonsRow();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({
          content: "What is your role in this trade?",
          components: [row],
        });
      } else if (
        interaction.customId === "role_buyer" ||
        interaction.customId === "role_seller"
      ) {
        setFlow(uid, {
          role: interaction.customId === "role_buyer" ? "buyer" : "seller",
          originalInteractionToken:
            getFlow(uid)?.originalInteractionToken || interaction.token,
        });

        const row = buildCounterpartySelectRow();
        await interaction.deferUpdate();
        await interaction.editReply({
          content: "Select the counterparty:",
          components: [row],
        });
      } else if (interaction.customId === "create_thread") {
        const flow = getFlow(uid);
        if (!flow || !flow.role || !flow.counterpartyId || !flow.description) {
          return await interaction.update({
            content:
              "Trade details are incomplete. Please restart with Create Trade.",
            components: [],
          });
        }
        if (flow.threadId) {
          return await interaction.update({
            content: `✅ Private thread already exists: <#${flow.threadId}>`,
            components: [],
          });
        }
        await interaction.update({
          content: "⏳ Creating private thread...",
          components: [],
        });

        const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
        const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;

        // Build confirmation embed to seed the thread
        const embed = buildCreatedEmbed({
          buyerId,
          sellerId,
          description: flow.description,
        });

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
        const agreeMsg = await thread.send({
          content: "Please both click Agree to proceed.",
          components: [buildAgreeRow()],
        });
        setFlow(uid, { threadId: thread.id, agreeMessageId: agreeMsg.id });
        setFlow(flow.counterpartyId, {
          threadId: thread.id,
          agreeMessageId: agreeMsg.id,
        });

        const originalToken = flow?.originalInteractionToken;
        const appId = client?.application?.id;
        if (originalToken && appId) {
          await updateEphemeralOriginal(appId, originalToken, {
            content: `✅ Private thread created: <#${thread.id}>`,
            components: [],
          });
        } else {
          await interaction.editReply({
            content: `✅ Private thread created: <#${thread.id}>`,
            components: [],
          });
        }
      } else if (interaction.customId === "agree_buyer") {
        const uid = interaction.user.id;
        const flow = getFlow(uid);
        if (!flow) {
          await interaction.reply({
            content: "No active trade flow found.",
            flags: MessageFlags.Ephemeral,
            components: [],
          });
          return;
        }
        const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
        if (uid !== buyerId) {
          await interaction.reply({
            content: "You are not the buyer for this trade.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (flow.buyerAgreed) {
          await interaction.reply({
            content: "You already agreed.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          setFlow(uid, { buyerAgreed: true });
          setFlow(flow.counterpartyId, { buyerAgreed: true });
          await interaction.showModal(buildBuyerAddressModal());
          const updated = getFlow(uid);
          if (updated?.agreeMessageId) {
            try {
              const msg = await interaction.channel.messages.fetch(
                updated.agreeMessageId,
              );
              await msg.edit({
                components: [
                  buildAgreeRow({
                    buyerDisabled: true,
                    sellerDisabled: !!updated.sellerAgreed,
                  }),
                ],
              });
            } catch {}
          }
        }
      } else if (interaction.customId === "agree_seller") {
        const uid = interaction.user.id;
        const flow = getFlow(uid);
        if (!flow) {
          await interaction.reply({
            content: "No active trade flow found.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;
        if (uid !== sellerId) {
          await interaction.reply({
            content: "You are not the seller for this trade.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (flow.sellerAgreed) {
          await interaction.reply({
            content: "You already agreed.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          setFlow(uid, { sellerAgreed: true });
          setFlow(flow.counterpartyId, { sellerAgreed: true });
          await interaction.showModal(buildSellerAddressModal());
          const updated = getFlow(uid);
          if (updated?.agreeMessageId) {
            try {
              const msg = await interaction.channel.messages.fetch(
                updated.agreeMessageId,
              );
              await msg.edit({
                components: [
                  buildAgreeRow({
                    buyerDisabled: !!updated.buyerAgreed,
                    sellerDisabled: true,
                  }),
                ],
              });
            } catch {}
          }
        }
      }
    }

    // Handle user select for counterparty
    if (
      interaction.isUserSelectMenu &&
      interaction.isUserSelectMenu() &&
      interaction.customId === "select_counterparty"
    ) {
      const uid = interaction.user.id;
      const [counterpartyId] = interaction.values;
      setFlow(uid, {
        counterpartyId,
        originalInteractionToken:
          getFlow(uid)?.originalInteractionToken || interaction.token,
      });
      const initiatorFlow = getFlow(uid) || {};
      const oppRole = initiatorFlow.role === "buyer" ? "seller" : "buyer";
      setFlow(counterpartyId, { role: oppRole, counterpartyId: uid });

      const modal = buildDescriptionModal();
      await interaction.showModal(modal);
    }

    // Handle modal submit for description
    if (
      interaction.isModalSubmit &&
      interaction.isModalSubmit() &&
      interaction.customId === "trade_description_modal"
    ) {
      const uid = interaction.user.id;
      const description =
        interaction.fields.getTextInputValue("trade_description");
      const priceUsd = interaction.fields.getTextInputValue("trade_price_usd");
      setFlow(uid, {
        description,
        originalInteractionToken:
          getFlow(uid)?.originalInteractionToken || interaction.token,
      });
      setPrice(uid, priceUsd);
      const flow = getFlow(uid);
      if (flow?.counterpartyId) {
        setFlow(flow.counterpartyId, { description });
        setPrice(flow.counterpartyId, priceUsd);
      }

      const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
      const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;

      const embed = buildConfirmationEmbed({
        buyerId,
        sellerId,
        description,
        priceUsd,
      });

      const row = buildCreateThreadRow();

      const originalToken = flow?.originalInteractionToken;
      const appId = client?.application?.id;
      if (originalToken && appId) {
        await updateEphemeralOriginal(appId, originalToken, {
          content: "Review the details and proceed to invite the counterparty.",
          embeds: [embed],
          components: [row],
        });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.deleteReply();
      } else {
        if (flow?.originalInteractionToken && client?.application?.id) {
          await updateEphemeralOriginal(
            client.application.id,
            flow.originalInteractionToken,
            {
              content:
                "Review the details and proceed to invite the counterparty.",
              embeds: [embed],
              components: [row],
            },
          );
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await interaction.deleteReply();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await interaction.editReply({
            content:
              "Review the details and proceed to invite the counterparty.",
            embeds: [embed],
            components: [row],
          });
        }
      }
    }

    if (
      interaction.isModalSubmit &&
      interaction.isModalSubmit() &&
      interaction.customId === "buyer_address_modal"
    ) {
      const uid = interaction.user.id;
      const addr = interaction.fields.getTextInputValue("buyer_address");
      setBuyerAddress(uid, addr);
      const flow = getFlow(uid);
      if (flow?.counterpartyId) {
        setBuyerAddress(flow.counterpartyId, addr);
      }
      const f = getFlow(uid);
      if (
        f?.buyerAgreed &&
        f?.sellerAgreed &&
        f?.buyerAddress &&
        f?.sellerAddress
      ) {
        try {
          const txHash = await createTrade(
            f.buyerAddress,
            f.sellerAddress,
            "0.001",
          );
          await interaction.channel.send({
            content: `✅ Trade created! Tx: ${txHash}`,
          });
        } catch (e) {
          await interaction.channel.send({
            content: `❌ Failed to create trade: ${e.message}`,
          });
        }
      }
      await interaction.reply({
        content: `Buyer address registered. Please send $${f?.priceUsd ?? "N/A"} to ${PAYMENT_ADDRESS}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      interaction.isModalSubmit &&
      interaction.isModalSubmit() &&
      interaction.customId === "seller_address_modal"
    ) {
      const uid = interaction.user.id;
      const addr = interaction.fields.getTextInputValue("seller_address");
      setSellerAddress(uid, addr);
      const flow = getFlow(uid);
      if (flow?.counterpartyId) {
        setSellerAddress(flow.counterpartyId, addr);
      }
      const f = getFlow(uid);
      if (
        f?.buyerAgreed &&
        f?.sellerAgreed &&
        f?.buyerAddress &&
        f?.sellerAddress
      ) {
        try {
          const txHash = await createTrade(
            f.buyerAddress,
            f.sellerAddress,
            "0.001",
          );
          await interaction.channel.send({
            content: `✅ Trade created! Tx: ${txHash}`,
          });
        } catch (e) {
          await interaction.channel.send({
            content: `❌ Failed to create trade: ${e.message}`,
          });
        }
      }
      await interaction.reply({
        content: "Seller address registered.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "There was an error handling your interaction.",
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
}
