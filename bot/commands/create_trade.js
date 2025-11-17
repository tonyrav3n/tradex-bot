/**
 * Create Trade Command
 *
 * Admin-only slash command that sends a public "Create Trade" embed with a button.
 * Users can click the button to start the trade creation flow.
 *
 * Permissions: Administrator only
 * Context: Guild (server) only
 *
 * @module commands/create_trade
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from 'discord.js';

import { buildTradeButton } from '../utils/components/buttons.js';
import { buildTradeEmbed } from '../utils/components/embeds.js';

/**
 * Slash command data definition
 * Configures the /create_trade command with admin-only permissions
 */
export const data = new SlashCommandBuilder()
  .setName('create_trade')
  .setDescription(`Send 'Create Trade' embed`)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild]);

/**
 * Execute the create_trade command
 *
 * Sends a public message with an embed explaining the trade system
 * and a button that users can click to start creating a trade.
 *
 * @param {ChatInputCommandInteraction} interaction - The slash command interaction
 * @returns {Promise<void>}
 *
 * @example
 * // User types: /create_trade
 * // Bot sends: Embed with "Create Trade" button
 * // Any user can click the button to start the flow
 */
export async function execute(interaction) {
  await interaction.reply({
    embeds: [buildTradeEmbed()],
    components: [buildTradeButton()],
  });
}
