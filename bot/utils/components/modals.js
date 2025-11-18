import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputStyle,
  TextInputBuilder,
} from 'discord.js';

/**
 * Build a trade details modal for collecting trade information
 *
 * Creates a modal form with three input fields:
 * - Item being traded (required, short text)
 * - Price in USD (required, short text)
 * - Additional details (optional, paragraph text)
 *
 * @param {string} role - The role of the user ('buyer' or 'seller')
 * @param {string} selectedUserId - Discord user ID of the trading counterparty
 * @returns {ModalBuilder} Configured modal ready to display
 *
 * @example
 * const modal = buildTradeDetailsModal('buyer', '123456789');
 * await interaction.showModal(modal);
 */
export function buildTradeDetailsModal(role, selectedUserId) {
  const itemInput = new TextInputBuilder()
    .setCustomId('item_input')
    .setLabel('What are you trading?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., ---, etc.')
    .setRequired(true)
    .setMaxLength(500);

  const priceInput = new TextInputBuilder()
    .setCustomId('price_input')
    .setLabel('Agreed price (USD)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 50.00')
    .setRequired(true)
    .setMaxLength(20);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description_input')
    .setLabel('Additional Details (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Any additional terms or conditions...')
    .setRequired(false)
    .setMaxLength(1000);

  return new ModalBuilder()
    .setCustomId(`trade_details_mdl:${role}:${selectedUserId}`)
    .setTitle('Trade Details')
    .addComponents(
      new ActionRowBuilder().addComponents(itemInput),
      new ActionRowBuilder().addComponents(priceInput),
      new ActionRowBuilder().addComponents(descriptionInput),
    );
}
