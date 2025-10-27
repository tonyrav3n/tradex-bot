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
import { normalizeAndValidateAddress } from "../utils/validation.js";

async function handleTradeDescriptionModal(client, interaction) {
  const uid = interaction.user.id;
  const description = interaction.fields.getTextInputValue("trade_description");
  const priceUsd = interaction.fields.getTextInputValue("trade_price_usd");

  // Store description for both sides
  const existingFlow = await getFlow(uid);
  const originalToken =
    existingFlow?.originalInteractionToken || interaction.token;

  await setFlow(uid, {
    description,
    originalInteractionToken: originalToken,
  });
  await setPrice(uid, priceUsd);

  const flow = await getFlow(uid);
  if (flow?.counterpartyId) {
    await setFlow(flow.counterpartyId, { description });
    await setPrice(flow.counterpartyId, priceUsd);
  }

  const buyerId = flow?.role === "buyer" ? uid : flow?.counterpartyId || uid;
  const sellerId = flow?.role === "seller" ? uid : flow?.counterpartyId || uid;

  const embed = buildConfirmationEmbed({
    buyerId,
    sellerId,
    description,
    priceUsd,
  });
  const row = buildCreateThreadRow();

  const appId = client?.application?.id;
  const responsePayload = {
    content: "Review the details and proceed to invite the counterparty.",
    embeds: [embed],
    components: [row],
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (originalToken && appId) {
    await updateEphemeralOriginal(appId, originalToken, responsePayload);
    await interaction.deleteReply();
  } else {
    await interaction.editReply(responsePayload);
  }
}

async function handleBuyerAddressModal(client, interaction) {
  const uid = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Verify the submitter is the locked buyer
  const fcheck = await getFlow(uid);
  const lockedBuyerId =
    fcheck?.buyerDiscordId ??
    (fcheck?.role === "buyer" ? uid : fcheck?.counterpartyId);
  if (uid !== lockedBuyerId) {
    await interaction.editReply({
      content: "You are not the buyer for this trade.",
    });
    return;
  }

  const rawBuyer = interaction.fields.getTextInputValue("buyer_address");
  const vBuyer = await normalizeAndValidateAddress(rawBuyer);
  if (!vBuyer.ok) {
    await interaction.editReply({ content: vBuyer.error });
    return;
  }
  await setBuyerAddress(uid, vBuyer.address);

  const flow = await getFlow(uid);
  if (flow?.counterpartyId) {
    await setBuyerAddress(flow.counterpartyId, vBuyer.address);
  }

  // Mark buyer agreed for both sides
  await setFlow(uid, { buyerAgreed: true });
  if (flow?.counterpartyId) {
    await setFlow(flow.counterpartyId, { buyerAgreed: true });
  }

  // Update the agree row UI state
  {
    const updated = await getFlow(uid);
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

  const f = await getFlow(uid);
  // If both parties agreed and provided addresses, create the trade
  if (
    f?.buyerAgreed &&
    f?.sellerAgreed &&
    f?.buyerAddress &&
    f?.sellerAddress
  ) {
    // Prevent identical buyer/seller addresses
    if (
      String(f.buyerAddress).toLowerCase() ===
      String(f.sellerAddress).toLowerCase()
    ) {
      await interaction.channel.send({
        content: "Buyer and Seller addresses must be different.",
      });
      return;
    }
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

async function handleSellerAddressModal(client, interaction) {
  const uid = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Verify the submitter is the locked seller
  const fcheck = await getFlow(uid);
  const lockedSellerId =
    fcheck?.sellerDiscordId ??
    (fcheck?.role === "seller" ? uid : fcheck?.counterpartyId);
  if (uid !== lockedSellerId) {
    await interaction.editReply({
      content: "You are not the seller for this trade.",
    });
    return;
  }

  const rawSeller = interaction.fields.getTextInputValue("seller_address");
  const vSeller = await normalizeAndValidateAddress(rawSeller);
  if (!vSeller.ok) {
    await interaction.editReply({ content: vSeller.error });
    return;
  }
  await setSellerAddress(uid, vSeller.address);

  const flow = await getFlow(uid);
  if (flow?.counterpartyId) {
    await setSellerAddress(flow.counterpartyId, vSeller.address);
  }

  // Mark seller agreed for both sides
  await setFlow(uid, { sellerAgreed: true });
  if (flow?.counterpartyId) {
    await setFlow(flow.counterpartyId, { sellerAgreed: true });
  }

  // Update the agree row UI state
  {
    const updated = await getFlow(uid);
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

  const f = await getFlow(uid);
  // If both parties agreed and provided addresses, create the trade
  if (
    f?.buyerAgreed &&
    f?.sellerAgreed &&
    f?.buyerAddress &&
    f?.sellerAddress
  ) {
    // Prevent identical buyer/seller addresses
    if (
      String(f.buyerAddress).toLowerCase() ===
      String(f.sellerAddress).toLowerCase()
    ) {
      await interaction.channel.send({
        content: "Buyer and Seller addresses must be different.",
      });
      return;
    }
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
