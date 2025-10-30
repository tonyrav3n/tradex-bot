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

export function buildTradeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_trade_flow_button")
      .setLabel("Create Trade")
      .setStyle(ButtonStyle.Success),
  );
}

export function buildTradeEmbed() {
  return new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🪙 TradeX")
    .setDescription("Ready to begin?\nClick below to create a trade.")
    .setFooter({ text: "Built for trustless digital trading." });
}

export function buildRoleButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("role_buyer")
      .setLabel("Buyer")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("role_seller")
      .setLabel("Seller")
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildCounterpartySelectRow() {
  const select = new UserSelectMenuBuilder()
    .setCustomId("select_counterparty")
    .setPlaceholder("Who's the counterparty?")
    .setMinValues(1)
    .setMaxValues(1);

  return new ActionRowBuilder().addComponents(select);
}

export function buildDescriptionModal() {
  const modal = new ModalBuilder()
    .setCustomId("trade_description_modal")
    .setTitle("Trade Details");

  const desc = new TextInputBuilder()
    .setCustomId("trade_description")
    .setLabel("Describe the item")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  const price = new TextInputBuilder()
    .setCustomId("trade_price_usd")
    .setLabel("Price (USD)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(desc);
  const row2 = new ActionRowBuilder().addComponents(price);
  modal.addComponents(row1, row2);
  return modal;
}

export function buildConfirmationEmbed({
  buyerId,
  sellerId,
  description,
  priceUsd,
}) {
  return new EmbedBuilder()
    .setTitle("💼 Confirm Trade Details")
    .setDescription("Please review the details below before proceeding:\n\n")
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false },
      {
        name: "Price (USD)",
        value: `$${priceUsd}`,
        inline: true,
      },
    )
    .setColor("#00B686");
}

export function buildCreatedEmbed({
  buyerId,
  sellerId,
  description,
  priceUsd,
}) {
  return new EmbedBuilder()
    .setTitle("💼 Trade Summary")
    .setDescription("Awaiting agreement from both parties:\n\n")
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false },
      { name: "Price (USD)", value: `$${priceUsd}`, inline: true },
    )
    .setFooter({ text: "🔐 Confirm to continue securely." })
    .setColor("#2ecc71");
}

export function buildCreateThreadRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_thread")
      .setLabel("✅ Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancel_create_thread")
      .setLabel("❌ Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildAgreeRow({
  buyerDisabled = false,
  sellerDisabled = false,
} = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("agree_buyer")
      .setLabel("✅ Buyer Agree")
      .setStyle(ButtonStyle.Success)
      .setDisabled(buyerDisabled),
    new ButtonBuilder()
      .setCustomId("agree_seller")
      .setLabel("🛒 Seller Agree")
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
  const modal = new ModalBuilder()
    .setCustomId("buyer_address_modal")
    .setTitle("Buyer Address");
  const input = new TextInputBuilder()
    .setCustomId("buyer_address")
    .setLabel("Your Address")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);
  return modal;
}

export function buildSellerAddressModal() {
  const modal = new ModalBuilder()
    .setCustomId("seller_address_modal")
    .setTitle("Seller Address");
  const input = new TextInputBuilder()
    .setCustomId("seller_address")
    .setLabel("Your Address")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);
  return modal;
}

export function buildEscrowStatusEmbed({
  escrowAddress,
  buyerId,
  sellerId,
  statusText = "Created",
  amountEth = "0",
  color = 0x95a5a6,
  title = "📊 Escrow Status",
  description,
} = {}) {
  const s = String(statusText ?? "").toLowerCase();
  let nextAction = null;
  if (s === "created") nextAction = "buyer to fund escrow";
  else if (s === "funded") nextAction = "seller to mark delivered";
  else if (s === "delivered") nextAction = "buyer to approve & release";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description ?? "Current escrow status and details.")
    .addFields(
      { name: "🕓 Status", value: statusText, inline: false },
      {
        name: "💵 Amount",
        value: amountEth ? `${amountEth} ETH` : "—",
        inline: false,
      },
      {
        name: "💰 Escrow",
        value: escrowAddress ? `\`${escrowAddress}\`` : "—",
        inline: false,
      },
      {
        name: "👤 Buyer",
        value: buyerId ? `<@${buyerId}>` : "—",
        inline: true,
      },
      {
        name: "🏷️ Seller",
        value: sellerId ? `<@${sellerId}>` : "—",
        inline: true,
      },
    )
    .setColor(color);

  if (nextAction) {
    embed.setFooter({ text: `🕓 Awaiting ${nextAction}` });
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
  if (s === 1 || s === "funded") {
    return [buildMarkDeliveredRow()];
  }
  if (s === 2 || s === "delivered") {
    return [buildApproveReleaseRow()];
  }
  return [];
}
