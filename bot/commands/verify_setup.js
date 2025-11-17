/**
 * Verify Setup Command
 *
 * Admin-only slash command that sends a public verification embed with a button.
 * New users can click the button to receive the verified role and gain access to the server.
 *
 * The role ID is configured via VERIFIED_ROLE_ID in the .env file.
 *
 * Permissions: Administrator only
 * Context: Guild (server) only
 *
 * @module commands/verify_setup
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from 'discord.js';

import { buildVerifyButton } from '../utils/components/buttons.js';
import { buildVerifyEmbed } from '../utils/components/embeds.js';

/**
 * Slash command data definition
 * Configures the /verify_setup command with admin-only permissions
 */
export const data = new SlashCommandBuilder()
  .setName('verify_setup')
  .setDescription(`Post 'Verify' embed`)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild]);

/**
 * Execute the verify_setup command
 *
 * Sends a public message with an embed explaining the verification process
 * and a button that users can click to get verified and access the server.
 *
 * @param {ChatInputCommandInteraction} interaction - The slash command interaction
 * @returns {Promise<void>}
 *
 * @example
 * // Admin types: /verify_setup
 * // Bot sends: Embed with "Verify Me" button
 * // New users click button to get verified role
 */
export async function execute(interaction) {
  await interaction.reply({
    embeds: [buildVerifyEmbed()],
    components: [buildVerifyButton()],
  });
}
