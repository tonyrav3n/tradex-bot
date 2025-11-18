import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Build a verification button for new users
 *
 * Creates a single green button that assigns the verified role when clicked.
 * Used in the /verify_setup command.
 *
 * @returns {ActionRowBuilder} Action row containing the verify button
 *
 * @example
 * const button = buildVerifyButton();
 * await interaction.reply({ components: [button] });
 */
export function buildVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_assign_role_btn')
      .setLabel('✅ Verify')
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Build the initial "Create Trade" button
 *
 * Creates a primary button that starts the trade creation flow.
 * Used in the /create_trade command.
 *
 * @returns {ActionRowBuilder} Action row containing the create trade button
 *
 * @example
 * const button = buildTradeButton();
 * await interaction.reply({ embeds: [embed], components: [button] });
 */
export function buildTradeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('create_trade_flow_btn')
      .setLabel('🛡️ Start a New Trade')
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Build role selection buttons (Buyer or Seller)
 *
 * Creates two buttons for the user to choose their role in the trade.
 * This is the first step in the trade creation flow.
 *
 * @returns {ActionRowBuilder} Action row containing buyer and seller buttons
 *
 * @example
 * const roleButtons = buildRoleButtonsRow();
 * await interaction.update({ content: "Choose your role:", components: [roleButtons] });
 */
export function buildRoleButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('role_btn:buyer')
      .setLabel("💸 I'm Buying")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('role_btn:seller')
      .setLabel("📦 I'm Selling")
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildTradeDetailsButtonRow(role, selectedUserId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_details_btn:${role}:${selectedUserId}`)
      .setLabel('📝 Continue')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`back_btn:counterparty:${role}`)
      .setLabel('⬅️ Back')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildCounterpartySelectBackButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`back_btn:role`)
      .setLabel('⬅️ Back')
      .setStyle(ButtonStyle.Secondary),
  );
}
