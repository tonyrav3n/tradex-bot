/**
 * Button interaction handlers for the Discord bot
 *
 * Handles all button clicks including:
 * - User verification
 * - Trade creation flow
 * - Role selection (buyer/seller)
 * - Back button navigation
 *
 * @module handlers/buttonsHandler
 */

import { MessageFlags } from 'discord.js';

import { env } from '../config/env.js';
import {
  buildRoleButtonsRow,
  buildCounterpartySelectBackButton,
} from '../utils/components/buttons.js';
import { buildTradeDetailsModal } from '../utils/components/modals.js';
import { buildCounterpartySelect } from '../utils/components/selects.js';
import { logger } from '../utils/logger.js';

const { VERIFIED_ROLE_ID } = env;

/**
 * Main button interaction handler - routes to specific handlers based on customId
 *
 * Parses the button's customId and delegates to the appropriate handler function.
 * CustomIds follow the pattern: "action:param1:param2:..."
 *
 * @param {ButtonInteraction} interaction - The Discord button interaction
 * @returns {Promise<void>}
 *
 * @example
 * // Called automatically by interactionCreate event
 * if (interaction.isButton()) {
 *   await handleButton(interaction);
 * }
 */
export async function handleButton(interaction) {
  const [action, ...args] = interaction.customId.split(':');

  switch (action) {
    case 'verify_assign_role_btn':
      return await handleVerifyButton(interaction);
    case 'create_trade_flow_btn':
      return await handleCreateTradeButton(interaction);
    case 'role_btn':
      return await handleRoleSelectorButton(interaction, args[0]);
    case 'back_btn':
      return await handleBackButton(interaction, args);
    case 'trade_details_btn':
      return await handleTradeDetailsButton(interaction, args[0], args[1]);
  }
}

/**
 * Handle verification button click - assigns verified role to user
 *
 * Checks if the user already has the verified role, then assigns it if not.
 * The role ID is configured via VERIFIED_ROLE_ID environment variable.
 *
 * @param {ButtonInteraction} interaction - The button interaction from /verify_setup
 * @returns {Promise<void>}
 * @private
 */
async function handleVerifyButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild } = interaction;
  const verifiedRoleId = VERIFIED_ROLE_ID;

  try {
    // Fetch the verified role from cache or API
    const verifiedRole =
      guild.roles.cache.get(verifiedRoleId) ||
      (await guild.roles.fetch(verifiedRoleId).catch(() => null));

    if (!verifiedRole) {
      return await interaction.editReply({
        content: '⚠️ The verification role could not be found on this server.',
      });
    }

    const { member } = interaction;

    // Check if user is already verified
    if (member.roles.cache.has(verifiedRoleId)) {
      return await interaction.editReply({
        content: 'ℹ️ You are already verified!',
      });
    }

    // Assign the verified role
    await member.roles.add(verifiedRole, 'Verify button assignment');

    await interaction.editReply({
      content: '✅ You have been verified and now have access to the server!',
    });
  } catch (error) {
    logger.error('Error assigning verification role:', error);
    await interaction.editReply({
      content: 'There was an error verifying you on this server.',
    });
  }
}

/**
 * Handle "Create Trade" button - starts the trade creation flow
 *
 * Creates an ephemeral message (only visible to the user) with role selection buttons.
 * This is the entry point for the trade creation flow.
 *
 * Flow: Create Trade → Role Selection → Counterparty Selection → Modal
 *
 * @param {ButtonInteraction} interaction - The button interaction from /create_trade
 * @returns {Promise<void>}
 * @private
 */
async function handleCreateTradeButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await interaction.editReply({
    content: "To start, what's your side of the trade?",
    components: [buildRoleButtonsRow()],
  });
}

/**
 * Handle role selection button (Buyer or Seller)
 *
 * Updates the interaction message to show a user select menu for choosing
 * a trading counterparty, along with a back button.
 * Uses interaction.update() to modify the existing message.
 *
 * @param {ButtonInteraction} interaction - The role button interaction
 * @param {string} role - The selected role ('buyer' or 'seller')
 * @returns {Promise<void>}
 * @private
 */
async function handleRoleSelectorButton(interaction, role) {
  logger.button(`role_btn:${role}`, interaction.user.id, { role });

  const selectedRole = role === 'buyer' ? 'Buyer' : 'Seller';

  await interaction.update({
    content: `You selected: **${selectedRole}**. Who are you trading with?`,
    components: [
      buildCounterpartySelect(role),
      buildCounterpartySelectBackButton(),
    ],
  });
}

/**
 * Handle back button navigation
 *
 * Navigates the user back to previous steps in the trade creation flow.
 * Uses interaction.update() to modify the message in-place without creating new messages.
 *
 * Supported destinations:
 * - 'role': Returns to role selection (from counterparty selection)
 *
 * @param {ButtonInteraction} interaction - The back button interaction
 * @param {string[]} args - Navigation arguments (destination, params)
 * @returns {Promise<void>}
 * @private
 */
async function handleBackButton(interaction, args) {
  const [destination, role] = args;
  const selectedRole = role === 'buyer' ? 'Buyer' : 'Seller';

  logger.button(`back_btn:${destination}:${role}`, interaction.user.id, {
    destination,
    role,
  });

  switch (destination) {
    case 'role':
      logger.debug('Navigating back to role selection');
      await interaction.update({
        content: "To start, what's your side of the trade?",
        embeds: [],
        components: [buildRoleButtonsRow()],
      });
      break;
    case 'counterparty':
      logger.debug('Navigating back to counterparty selection', { role });
      await interaction.update({
        content: `You selected: **${selectedRole}**. Who are you trading with?`,
        embeds: [],
        components: [
          buildCounterpartySelect(role),
          buildCounterpartySelectBackButton(),
        ],
      });
      break;
  }
}

async function handleTradeDetailsButton(interaction, role, selectedUserId) {
  logger.button(
    `trade_details_btn:${role}:${selectedUserId}`,
    interaction.user.id,
    { role, selectedUserId },
  );

  try {
    const modal = buildTradeDetailsModal(role, selectedUserId);
    await interaction.showModal(modal);
    logger.success('Trade details modal shown successfully');
  } catch (error) {
    logger.error('Error showing trade details modal:', error);
    logger.debug('Modal error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    try {
      await interaction.reply({
        content: '⚠️ Failed to open trade details form. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (replyError) {
      logger.error('Failed to send error reply for modal failure:', replyError);
    }
  }
}
