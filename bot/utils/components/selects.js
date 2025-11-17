import { ActionRowBuilder, UserSelectMenuBuilder } from 'discord.js';

/**
 * Build a user select menu for choosing a trading counterparty
 *
 * Creates a dropdown menu that allows the user to select another Discord user
 * to trade with. The selection will be validated to prevent self-selection
 * and bot selection.
 *
 * @param {string} role - The role of the current user ('buyer' or 'seller')
 * @returns {ActionRowBuilder} Action row containing the user select menu
 *
 * @example
 * const selectMenu = buildCounterpartySelect('buyer');
 * await interaction.update({
 *   content: "Who are you trading with?",
 *   components: [selectMenu]
 * });
 */
export function buildCounterpartySelect(role) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`select_counterparty_slt:${role}`)
      .setPlaceholder('🤝 Select the counterparty...')
      .setMinValues(1)
      .setMaxValues(1),
  );
}
