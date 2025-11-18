/**
 * Select menu interaction handlers for the Discord bot
 *
 * Handles all select menu interactions including:
 * - User selection for trading counterparty
 * - Validation of selected users (prevents self and bot selection)
 *
 * @module handlers/selectsHandler
 */

import { MessageFlags } from 'discord.js';

import { buildTradeDetailsButtonRow } from '../utils/components/buttons.js';
import { buildSubmitTradeDetailsEmbed } from '../utils/components/embeds.js';
import { logger } from '../utils/logger.js';

/**
 * Main select menu interaction handler - routes to specific handlers based on customId
 *
 * Parses the select menu's customId and delegates to the appropriate handler function.
 * CustomIds follow the pattern: "action:param1:param2:..."
 *
 * @param {SelectMenuInteraction} interaction - The Discord select menu interaction
 * @returns {Promise<void>}
 *
 * @example
 * // Called automatically by interactionCreate event
 * if (interaction.isAnySelectMenu()) {
 *   await handleSelect(interaction);
 * }
 */
export async function handleSelect(interaction) {
  const [action, ...args] = interaction.customId.split(':');

  logger.select(interaction.customId, interaction.user.id, interaction.values, {
    action,
    args,
  });

  switch (action) {
    case 'select_counterparty_slt':
      return await handleCounterpartySelect(interaction, args[0]);
    default:
      logger.warn(`Unknown select action: ${action}`);
  }
}

/**
 * Handle counterparty user selection for trade creation
 *
 * Validates the selected user and displays the trade details modal.
 * Validation checks:
 * 1. User cannot select themselves as counterparty
 * 2. User cannot select bots as counterparty
 *
 * If validation passes, shows the trade details modal for entering
 * item, price, and description.
 *
 * @param {SelectMenuInteraction} interaction - The user select menu interaction
 * @param {string} role - The role of the current user ('buyer' or 'seller')
 * @returns {Promise<void>}
 * @private
 */
async function handleCounterpartySelect(interaction, role) {
  const selectedUserId = interaction.values[0];

  logger.debug('Counterparty selected:', {
    role,
    selectedUserId,
    userId: interaction.user.id,
  });

  // Validation 1: Prevent selecting yourself as trading counterparty
  if (selectedUserId === interaction.user.id) {
    logger.warn('User tried to select themselves as counterparty');
    return await interaction.reply({
      content: '⚠️ You cannot trade with yourself! Please select another user.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Validation 2: Fetch the selected user to check if they're a bot
  try {
    const selectedUser = await interaction.client.users.fetch(selectedUserId);

    // Bots cannot be trading counterparties
    if (selectedUser.bot) {
      logger.warn('User tried to select a bot as counterparty');
      return await interaction.reply({
        content: '⚠️ You cannot trade with bots! Please select a real user.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (fetchError) {
    logger.error('Failed to fetch selected user:', fetchError);
    return await interaction.reply({
      content: '⚠️ Failed to verify the selected user. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // All validations passed - show trade setup completion screen
  logger.debug('Counterparty validated, showing trade setup completion:', {
    role,
    selectedUserId,
  });

  await interaction.update({
    content: '',
    embeds: [buildSubmitTradeDetailsEmbed()],
    components: [buildTradeDetailsButtonRow(role, selectedUserId)],
  });
}
