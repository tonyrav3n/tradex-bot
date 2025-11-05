import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";

import { COLORS, escrowEmbedColorForStatus, ASSETS } from "./theme.js";
import {
  formatEth,
  formatUsd,
  toNumberLoose,
  buildEtherscanAddressUrl,
} from "./format.js";

export function buildTradeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_trade_flow_button")
      .setLabel("Start a New Trade")
      .setStyle(ButtonStyle.Success),
  );
}

export function buildTradeEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle("🛡️ Start a Secure Trade")
    .setDescription(
      "Ready to go? I'm here to help! Click below and I'll walk you through creating a secure, fair trade for you and your partner.",
    )
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({
      text: "amis.",
      iconURL: ASSETS.LOGO_URL,
    });
}

export function buildRoleButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("role_buyer")
      .setLabel("I'm Buying")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("role_seller")
      .setLabel("I'm Selling")
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildCounterpartySelectRow() {
  const select = new UserSelectMenuBuilder()
    .setCustomId("select_counterparty")
    .setPlaceholder("Select the counterparty...")
    .setMinValues(1)
    .setMaxValues(1);

  return new ActionRowBuilder().addComponents(select);
}

export function buildDescriptionModal() {
  const desc = new TextInputBuilder()
    .setCustomId("trade_description")
    .setLabel("What are you trading?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  const price = new TextInputBuilder()
    .setCustomId("trade_price_usd")
    .setLabel("Agreed price (USD)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(desc);
  const row2 = new ActionRowBuilder().addComponents(price);

  const modal = new ModalBuilder()
    .setCustomId("trade_description_modal")
    .setTitle("Trade Details")
    .addComponents(row1, row2);

  return modal;
}

export function buildConfirmationEmbed({
  buyerId,
  sellerId,
  description,
  priceUsd,
}) {
  const baseUsd = toNumberLoose(priceUsd);
  const buyerTotalUsd = Number.isFinite(baseUsd) ? baseUsd * 1.025 : null;
  const sellerPayoutUsd = Number.isFinite(baseUsd) ? baseUsd * 0.975 : null;

  const feesText =
    buyerTotalUsd != null && sellerPayoutUsd != null
      ? `Buyer pays: $${formatUsd(buyerTotalUsd)} (includes 2.5% fee)\nSeller receives on release: $${formatUsd(sellerPayoutUsd)} (after 2.5% fee)`
      : "Buyer fee: 2.5% on top • Seller fee: 2.5% on payout";

  return new EmbedBuilder()
    .setTitle("✅ Let's Double-Check!")
    .setDescription(
      "Please make sure everything is perfect. This will become the basis for our secure contract.\n\n",
    )
    .addFields(
      { name: "\nBuyer", value: `<@${buyerId}>`, inline: true },
      { name: "\nSeller", value: `<@${sellerId}>`, inline: true },
      { name: "\nItem", value: description, inline: false },
      {
        name: "\nPrice (USD)",
        value: `$${priceUsd}`,
        inline: true,
      },
    )
    .addFields({
      name: "\nFees",
      value: feesText,
      inline: false,
    })
    .setColor(COLORS.VERIFIED_GREEN);
}

export function buildCreatedEmbed({
  buyerId,
  sellerId,
  description,
  priceUsd,
}) {
  const baseUsd = toNumberLoose(priceUsd);
  const buyerTotalUsd = Number.isFinite(baseUsd) ? baseUsd * 1.025 : null;
  const sellerPayoutUsd = Number.isFinite(baseUsd) ? baseUsd * 0.975 : null;

  const feesText =
    buyerTotalUsd != null && sellerPayoutUsd != null
      ? `Buyer pays: $${formatUsd(buyerTotalUsd)} (includes 2.5% fee)\nSeller receives on release: $${formatUsd(sellerPayoutUsd)} (after 2.5% fee)`
      : "Buyer fee: 2.5% on top • Seller fee: 2.5% on payout";

  return new EmbedBuilder()
    .setTitle("📄 Trade Summary")
    .setDescription(
      "Please review the details below. Once you both agree, I'll ask the buyer to fund the trade.",
    )
    .addFields(
      { name: "\nBuyer", value: `<@${buyerId}>`, inline: true },
      { name: "\nSeller", value: `<@${sellerId}>`, inline: true },
      { name: "\nItem", value: description, inline: false },
      { name: "\nPrice (USD)", value: `$${priceUsd}`, inline: true },
    )
    .addFields({
      name: "\nFees",
      value: feesText,
      inline: false,
    })
    .setFooter({ text: "Final check." })
    .setColor(COLORS.VERIFIED_GREEN);
}

export function buildCreateThreadRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_thread")
      .setLabel("✅ Looks Good")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancel_create_thread")
      .setLabel("❌ Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildVerifyButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_assign_role")
      .setLabel("✅ Verify")
      .setStyle(ButtonStyle.Success),
  );
}

export function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.VERIFIED_GREEN)
    .setTitle("👋 Welcome to amis.!")
    .setDescription("Click on the button below to gain access.")
    .setThumbnail(ASSETS.LOGO_URL)
    .setFooter({ text: "amis.", iconURL: ASSETS.LOGO_URL });
}

export function buildAgreeRow({
  buyerDisabled = false,
  sellerDisabled = false,
} = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("agree_buyer")
      .setLabel("✅ I Agree (Buyer)")
      .setStyle(ButtonStyle.Success)
      .setDisabled(buyerDisabled),
    new ButtonBuilder()
      .setCustomId("agree_seller")
      .setLabel("✅ I Agree (Seller)")
      .setStyle(ButtonStyle.Success)
      .setDisabled(sellerDisabled),
  );
}

export function buildProvideBuyerAddressRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("provide_buyer_address")
      .setLabel("Provide Address")
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildProvideSellerAddressRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("provide_seller_address")
      .setLabel("Provide Address")
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildBuyerAddressModal() {
  const input = new TextInputBuilder()
    .setCustomId("buyer_address")
    .setLabel("Your Address")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(input);
  const modal = new ModalBuilder()
    .setCustomId("buyer_address_modal")
    .setTitle("Buyer Address")
    .addComponents(row);

  return modal;
}

export function buildSellerAddressModal() {
  const input = new TextInputBuilder()
    .setCustomId("seller_address")
    .setLabel("Your Address")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(input);
  const modal = new ModalBuilder()
    .setCustomId("seller_address_modal")
    .setTitle("Seller Address")
    .addComponents(row);

  return modal;
}

export function buildEscrowStatusEmbed({
  escrowAddress,
  buyerId,
  sellerId,
  statusText = "Created",
  amountEth = "0",
  priceUsd,

  title = "📊 Escrow Status",
  description,
} = {}) {
  const s = String(statusText ?? "").toLowerCase();
  let nextAction = null;
  if (s === "created") nextAction = "buyer to fund escrow";
  else if (s === "funded") nextAction = "seller to deliver";
  else if (s === "delivered") nextAction = "buyer to approve & release";

  // Compute fee breakdowns (base amount = escrowed amount = amountEth)
  const baseEthNum = toNumberLoose(amountEth);
  const haveBase = Number.isFinite(baseEthNum) && baseEthNum > 0;

  const sellerPayoutEthNum = haveBase ? baseEthNum * 0.975 : null;

  const baseUsd = toNumberLoose(priceUsd);
  const buyerTotalUsdNum = Number.isFinite(baseUsd) ? baseUsd * 1.025 : null;
  const sellerPayoutUsdNum = Number.isFinite(baseUsd) ? baseUsd * 0.975 : null;

  const feesLines = [];
  if (haveBase) {
    feesLines.push(
      `Buyer pays: ${formatEth(baseEthNum * 1.025)} ETH (includes 2.5% fee)`,
    );
    feesLines.push(
      `Seller receives: ${formatEth(sellerPayoutEthNum)} ETH (after 2.5% fee)`,
    );
  }
  if (buyerTotalUsdNum != null && sellerPayoutUsdNum != null) {
    feesLines.push(
      `Buyer pays: $${formatUsd(buyerTotalUsdNum)} • Seller receives: $${formatUsd(
        sellerPayoutUsdNum,
      )}`,
    );
  }
  const feesValue =
    feesLines.length > 0
      ? feesLines.join("\n")
      : "Buyer fee: 2.5% on top • Seller fee: 2.5% on payout";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description ?? "Current escrow status and details.")
    .addFields(
      { name: "\nStatus", value: statusText, inline: false },
      {
        name: "\nPrice (USD)",
        value: priceUsd ? `$${priceUsd}` : "—",
        inline: false,
      },
      {
        name: "\nAmount (ETH)",
        value: amountEth ? `${amountEth} ETH` : "—",
        inline: true,
      },
      {
        name: "\nEscrow",
        value: escrowAddress
          ? `[${escrowAddress}](${buildEtherscanAddressUrl(escrowAddress)})`
          : "—",
        inline: false,
      },
      {
        name: "\nBuyer",
        value: buyerId ? `<@${buyerId}>` : "—",
        inline: true,
      },
      {
        name: "\nSeller",
        value: sellerId ? `<@${sellerId}>` : "—",
        inline: true,
      },
      {
        name: "\nFees & Totals",
        value: feesValue,
        inline: false,
      },
    )
    .setColor(escrowEmbedColorForStatus(statusText));

  if (nextAction) {
    embed.setFooter({ text: `Awaiting ${nextAction}` });
  }

  return embed;
}

export function buildDeliveryActionsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mark_delivered")
      .setLabel("Mark Delivered")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("approve_release")
      .setLabel("Approve & Release")
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Single-action row: only Mark Delivered (for Funded state)
 */
export function buildMarkDeliveredRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mark_delivered")
      .setLabel("Mark Delivered")
      .setStyle(ButtonStyle.Primary),
  );
}

/**
 * Single-action row: only Approve & Release (for Delivered state)
 */
export function buildApproveReleaseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("approve_release")
      .setLabel("Approve & Release")
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Helper to choose status-specific action buttons.
 * Accepts either numeric status (enum) or status text.
 *
 * - Created/Completed/Cancelled/Disputed: no actions
 * - Funded: Mark Delivered
 * - Delivered: Approve & Release
 */
export function buildActionsForStatus(status) {
  const s = typeof status === "string" ? status.toLowerCase() : Number(status);

  // Created, Completed, Cancelled, Disputed -> no actions
  if (s === 1 || s === "funded") {
    // Funded -> Primary (blue) "Mark Delivered"
    return [buildMarkDeliveredRow()];
  }
  if (s === 2 || s === "delivered") {
    // Delivered -> Success (green) "Approve & Release"
    return [buildApproveReleaseRow()];
  }
  return [];
}
