/**
 * InteractionCreate event handler
 *
 * Handles all types of Discord interactions including:
 * - Slash commands (chat input commands)
 * - Button clicks
 * - Select menus (user, string, role, channel, mentionable)
 * - Modals (handled in separate modal handler)
 *
 * This is the main router for all interactive elements in the bot.
 *
 * @module events/interactionCreate
 */

import { handleButton } from '../handlers/buttonsHandler.js';
import { handleModal } from '../handlers/modalsHandler.js';
import { handleSelect } from '../handlers/selectsHandler.js';
import { logger } from '../utils/logger.js';

export const name = 'interactionCreate';
export const once = false;

/**
 * Execute function called whenever any interaction is created
 *
 * Routes different interaction types to their appropriate handlers:
 * - Commands → Command executor
 * - Buttons → Button handler
 * - Select menus → Select handler
 * - Modals → Modal handler
 *
 * @param {Client} client - The Discord client instance
 * @param {Interaction} interaction - The interaction that was created
 * @returns {Promise<void>}
 */
export async function execute(client, interaction) {
  // Handle slash commands (e.g., /create_trade, /verify_setup)
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    logger.command(interaction.commandName, interaction.user.id);

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(
        `Error executing command ${interaction.commandName}:`,
        error,
      );
    }
  }

  // Handle button clicks (verify, create trade, role selection, back navigation)
  if (interaction.isButton()) {
    logger.button(interaction.customId, interaction.user.id);
    await handleButton(interaction);
  }

  // Handle all select menu types (user, string, role, channel, mentionable)
  if (interaction.isAnySelectMenu()) {
    await handleSelect(interaction);
  }

  // Handle modal submissions (trade details, etc.)
  if (interaction.isModalSubmit()) {
    logger.modal(interaction.customId, interaction.user.id);
    await handleModal(interaction);
  }
}
