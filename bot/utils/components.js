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
      .setLabel("Start a New Trade")
      .setStyle(ButtonStyle.Success),
  );
}

export function buildTradeEmbed() {
  return new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("Start a Secure Trade")
    .setDescription(
      "Ready to go? I'm here to help!\nClick below \
      and I'll walk you through creating a secure, \
      fair trade for you and your partner.",
    )
    .setFooter({ text: "amis. The digital handshake you can trust." });
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
    .setPlaceholder("Select your trading partner...")
    .setMinValues(1)
    .setMaxValues(1);

  return new ActionRowBuilder().addComponents(select);
}

export function buildDescriptionModal() {
  const desc = new TextInputBuilder({
    custom_id: "trade_description",
    label: "What are you trading? (Be as clear as possible)",
    style: TextInputStyle.Paragraph,
    required: true,
    max_length: 500,
  });

  const price = new TextInputBuilder({
    custom_id: "trade_price_usd",
    label: "What's the agreed price? (USD)",
    style: TextInputStyle.Short,
    required: true,
  });

  const row1 = new ActionRowBuilder().addComponents(desc);
  const row2 = new ActionRowBuilder().addComponents(price);

  return new ModalBuilder({
    custom_id: "trade_description_modal",
    title: "Trade Details",
    components: [row1, row2],
  });
}

export function buildConfirmationEmbed({
  buyerId,
  sellerId,
  description,
  priceUsd,
}) {
  return new EmbedBuilder()
    .setTitle("Let's Double-Check!")
    .setDescription(
      "Please make sure everything is perfect. This will become the basis for our secure contract.:\n\n",
    )
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "\nSeller", value: `<@${sellerId}>`, inline: true },
      { name: "\nItem", value: description, inline: false },
      {
        name: "\nPrice (USD)",
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
    .setTitle("Trade Summary")
    .setDescription(
      "Please review the details below. Once you both agree, I'll ask the buyer to fund the trade.",
    )
    .addFields(
      { name: "\nBuyer", value: `<@${buyerId}>`, inline: true },
      { name: "\nSeller", value: `<@${sellerId}>`, inline: true },
      { name: "\nItem", value: description, inline: false },
      { name: "\nPrice (USD)", value: `$${priceUsd}`, inline: true },
    )
    .setFooter({ text: "Final check." })
    .setColor("#2ecc71");
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
  const input = new TextInputBuilder({
    custom_id: "buyer_address",
    label: "Your Address",
    style: TextInputStyle.Short,
    required: true,
  });
  const row = new ActionRowBuilder().addComponents(input);
  return new ModalBuilder({
    custom_id: "buyer_address_modal",
    title: "Buyer Address",
    components: [row],
  });
}

export function buildSellerAddressModal() {
  const input = new TextInputBuilder({
    custom_id: "seller_address",
    label: "Your Address",
    style: TextInputStyle.Short,
    required: true,
  });
  const row = new ActionRowBuilder().addComponents(input);
  return new ModalBuilder({
    custom_id: "seller_address_modal",
    title: "Seller Address",
    components: [row],
  });
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
  else if (s === "funded") nextAction = "seller to deliver";
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
