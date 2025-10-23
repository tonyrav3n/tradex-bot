/**
 * Modal interaction handlers extracted from the monolithic interactionCreate.js.
 *
 * Handles:
 * - trade_description_modal
 * - buyer_address_modal
 * - seller_address_modal
 *
 * Responsibilities:
 * - Maintain flow state symmetry for both parties
 * - Update ephemeral originals when available
 * - Create trades when both parties agreed and provided addresses
 * - Initialize escrow status embed and event watcher
 */

import { MessageFlags } from "discord.js";
import {
  getFlow,
  setFlow,
  setPrice,
  setBuyerAddress,
  setSellerAddress,
} from "../utils/flowRepo.js";
import {
  buildConfirmationEmbed,
  buildCreateThreadRow,
  buildAgreeRow,
} from "../utils/components.js";
import { updateEphemeralOriginal } from "../utils/ephemeral.js";
import { createAndAnnounceTrade } from "../utils/tradeFlow.js";
import { initEscrowStatusAndWatcher } from "../utils/escrowStatus.js";

/**
 * trade_description_modal
 * - Captures item description and price (USD)
 * - Builds confirmation embed with buyer/seller derived from role
 * - Updates the original ephemeral message if possible
 */
async function handleTradeDescriptionModal(client, interaction) {
  const uid = interaction.user.id;
  const description = interaction.fields.getTextInputValue("trade_description");
  const priceUsd = interaction.fields.getTextInputValue("trade_price_usd");

  // Store description for both sides
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

  // Update the original ephemeral message when possible
  const originalToken = flow?.originalInteractionToken;
  const appId = client?.application?.id;

  if (originalToken && appId) {
    await updateEphemeralOriginal(appId, originalToken, {
      content: "Review the details and proceed to invite the counterparty.",
      embeds: [embed],
      components: [row],
    });
    // Create and immediately clean up a placeholder ephemeral reply to satisfy Discord's modal response requirement.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.deleteReply();
  } else {
    // Fallback: update via the current interaction's ephemeral reply
    if (flow?.originalInteractionToken && client?.application?.id) {
      await updateEphemeralOriginal(
        client.application.id,
        flow.originalInteractionToken,
        {
          content: "Review the details and proceed to invite the counterparty.",
          embeds: [embed],
          components: [row],
        },
      );
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.deleteReply();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({
        content: "Review the details and proceed to invite the counterparty.",
        embeds: [embed],
        components: [row],
      });
    }
  }
}

/**
 * buyer_address_modal
 * - Captures buyer address, marks buyerAgreed
 * - When both parties have agreed and provided addresses, creates the escrow
 * - Initializes escrow status embed and watcher
 */
async function handleBuyerAddressModal(client, interaction) {
  const uid = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Verify the submitter is the locked buyer
  const fcheck = getFlow(uid);
  const lockedBuyerId =
    fcheck?.buyerDiscordId ??
    (fcheck?.role === "buyer" ? uid : fcheck?.counterpartyId);
  if (uid !== lockedBuyerId) {
    await interaction.editReply({
      content: "You are not the buyer for this trade.",
    });
    return;
  }

  const addr = interaction.fields.getTextInputValue("buyer_address");
  setBuyerAddress(uid, addr);

  const flow = getFlow(uid);
  if (flow?.counterpartyId) {
    setBuyerAddress(flow.counterpartyId, addr);
  }

  // Mark buyer agreed for both sides
  setFlow(uid, { buyerAgreed: true });
  if (flow?.counterpartyId) {
    setFlow(flow.counterpartyId, { buyerAgreed: true });
  }

  // Update the agree row UI state
  {
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
      } catch {
        // no-op
      }
    }
  }

  const f = getFlow(uid);
  // If both parties agreed and provided addresses, create the trade
  if (
    f?.buyerAgreed &&
    f?.sellerAgreed &&
    f?.buyerAddress &&
    f?.sellerAddress
  ) {
    try {
      await createAndAnnounceTrade({
        channel: interaction.channel,
        uid,
        buyerAddress: f.buyerAddress,
        sellerAddress: f.sellerAddress,
        amountEth: "0.001",
        initOptions: {
          backfill: true,
          title: "Escrow Status",
          initialDescription:
            "This will update automatically when the buyer funds the escrow.",
          updatedDescription: "Escrow status has been updated.",
        },
      });
    } catch (e) {
      await interaction.channel.send({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    }
  }

  await interaction.editReply({
    content: "Buyer address registered.",
  });
}

/**
 * seller_address_modal
 * - Captures seller address, marks sellerAgreed
 * - When both parties have agreed and provided addresses, creates the escrow
 * - Initializes escrow status embed and watcher
 */
async function handleSellerAddressModal(client, interaction) {
  const uid = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Verify the submitter is the locked seller
  const fcheck = getFlow(uid);
  const lockedSellerId =
    fcheck?.sellerDiscordId ??
    (fcheck?.role === "seller" ? uid : fcheck?.counterpartyId);
  if (uid !== lockedSellerId) {
    await interaction.editReply({
      content: "You are not the seller for this trade.",
    });
    return;
  }

  const addr = interaction.fields.getTextInputValue("seller_address");
  setSellerAddress(uid, addr);

  const flow = getFlow(uid);
  if (flow?.counterpartyId) {
    setSellerAddress(flow.counterpartyId, addr);
  }

  // Mark seller agreed for both sides
  setFlow(uid, { sellerAgreed: true });
  if (flow?.counterpartyId) {
    setFlow(flow.counterpartyId, { sellerAgreed: true });
  }

  // Update the agree row UI state
  {
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
      } catch {
        // no-op
      }
    }
  }

  const f = getFlow(uid);
  // If both parties agreed and provided addresses, create the trade
  if (
    f?.buyerAgreed &&
    f?.sellerAgreed &&
    f?.buyerAddress &&
    f?.sellerAddress
  ) {
    try {
      await createAndAnnounceTrade({
        channel: interaction.channel,
        uid,
        buyerAddress: f.buyerAddress,
        sellerAddress: f.sellerAddress,
        amountEth: "0.001",
        initOptions: {
          backfill: true,
          title: "Escrow Status",
          initialDescription:
            "This will update automatically when the buyer funds the escrow.",
          updatedDescription: "Escrow status has been updated.",
        },
      });
    } catch (e) {
      await interaction.channel.send({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    }
  }

  await interaction.editReply({
    content: "Seller address registered.",
  });
}

/**
 * Main modal dispatcher to be used by the top-level interaction handler.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleModal(client, interaction) {
  const id = interaction.customId;

  try {
    switch (id) {
      case "trade_description_modal":
        return handleTradeDescriptionModal(client, interaction);
      case "buyer_address_modal":
        return handleBuyerAddressModal(client, interaction);
      case "seller_address_modal":
        return handleSellerAddressModal(client, interaction);
      default:
        return;
    }
  } catch (err) {
    // Best-effort error response without throwing
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: `There was an error handling your submission: ${err.message}`,
        });
      } catch {}
    } else if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: `There was an error handling your submission: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
}

export default {
  handleModal,
};
