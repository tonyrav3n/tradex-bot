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

export function buildTradeButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_trade_button")
      .setLabel("Demo Trx")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("create_trade_flow_button")
      .setLabel("Create Trade")
      .setStyle(ButtonStyle.Success)
  );
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
      .setStyle(ButtonStyle.Primary)
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

export function buildConfirmationEmbed({ buyerId, sellerId, description, priceUsd }) {
  return new EmbedBuilder()
    .setTitle("💼 Confirm Trade Details")
    .setDescription(`Please review the details below before proceeding:\n\n`)
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false },
      { name: "Price (USD)", value: priceUsd ? `$${priceUsd}` : "—", inline: true }
    )
    .setColor("#00B686");
}

export function buildCreatedEmbed({ buyerId, sellerId, description }) {
  return new EmbedBuilder()
    .setTitle("Trade Created")
    .setDescription("A private thread has been created for this trade.")
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false }
    )
    .setFooter({ text: "Built for trustless digital trading." })
    .setColor("#2ecc71");
}

export function buildCreateThreadRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_thread")
      .setLabel("✅ Confirm")
      .setStyle(ButtonStyle.Success)
  );
}

export function buildAgreeRow({ buyerDisabled = false, sellerDisabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("agree_buyer")
      .setLabel("Buyer Agree")
      .setStyle(ButtonStyle.Success)
      .setDisabled(buyerDisabled),
    new ButtonBuilder()
      .setCustomId("agree_seller")
      .setLabel("Seller Agree")
      .setStyle(ButtonStyle.Success)
      .setDisabled(sellerDisabled)
  );
}

export function buildProvideBuyerAddressRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("provide_buyer_address")
      .setLabel("Provide Address")
      .setStyle(ButtonStyle.Primary)
  );
}

export function buildProvideSellerAddressRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("provide_seller_address")
      .setLabel("Provide Address")
      .setStyle(ButtonStyle.Primary)
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