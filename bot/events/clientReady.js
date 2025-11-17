/**
 * ClientReady event handler
 *
 * Executes once when the bot successfully connects to Discord and is ready to operate.
 * Handles initialization tasks including:
 * - Logging bot connection status
 * - Registering slash commands with Discord API
 *
 * @module events/clientReady
 */

import { REST, Routes } from 'discord.js';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const name = 'clientReady';
export const once = true;

/**
 * Execute function called when the bot is ready
 *
 * Runs only once when the bot successfully connects to Discord.
 * Logs connection information and registers all slash commands.
 *
 * @param {Client} client - The Discord client instance
 * @returns {Promise<void>}
 */
export async function execute(client) {
  logger.success(`Logged in as ${client.user.tag}`);
  logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

  // Register commands with Discord API
  await registerCommands(client);

  logger.success('Bot is ready and operational!');
}

/**
 * Register all slash commands with Discord API
 *
 * Collects all commands from the client.commands collection and registers them
 * with Discord's API for the configured guild (GUILD_ID in .env).
 *
 * Uses guild-specific registration for faster command updates during development.
 * For production, consider using global command registration instead.
 *
 * @param {Client} client - The Discord client instance with loaded commands
 * @returns {Promise<void>}
 * @private
 */
async function registerCommands(client) {
  const commands = [];

  // Collect all command data from loaded command modules
  for (const [name, commandModule] of client.commands) {
    if (commandModule?.data?.toJSON) {
      commands.push(commandModule.data.toJSON());
      logger.debug(`Prepared command for registration: ${name}`);
    } else {
      logger.warn(`Command ${name} missing data.toJSON() method`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(env.TOKEN);

  try {
    logger.info(`Registering ${commands.length} application (/) commands...`);

    // Register commands to specific guild (faster updates than global)
    const data = await rest.put(
      Routes.applicationGuildCommands(client.user.id, env.GUILD_ID),
      { body: commands },
    );
    logger.success(`Successfully registered ${data.length} guild commands`);
  } catch (error) {
    logger.error('Error registering commands:', error);
  }
}
