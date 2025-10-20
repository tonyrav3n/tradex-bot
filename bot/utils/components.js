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
      .setStyle(ButtonStyle.Success),
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
    .setTitle("Trade Item Description");

  const input = new TextInputBuilder()
    .setCustomId("trade_description")
    .setLabel("Describe the item")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);
  return modal;
}

export function buildConfirmationEmbed({ buyerId, sellerId, description }) {
  return new EmbedBuilder()
    .setTitle("Confirm Trade Details")
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false },
    )
    .setColor(0x3498db);
}

export function buildCreatedEmbed({ buyerId, sellerId, description }) {
  return new EmbedBuilder()
    .setTitle("Trade Created")
    .setDescription("A private thread has been created for this trade.")
    .addFields(
      { name: "Buyer", value: `<@${buyerId}>`, inline: true },
      { name: "Seller", value: `<@${sellerId}>`, inline: true },
      { name: "Item", value: description, inline: false },
    )
    .setColor(0x2ecc71);
}

export function buildCreateThreadRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_thread")
      .setLabel("Create Private Thread")
      .setStyle(ButtonStyle.Success),
  );
}
