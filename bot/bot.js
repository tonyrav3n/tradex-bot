/**
 * Main Discord Bot Entry Point
 *
 * Initializes and configures the Discord bot with:
 * - Command loading from /commands directory
 * - Event handler registration from /events directory
 * - Environment variable validation
 * - Discord client setup with required intents
 *
 * The bot handles trade escrow management through interactive Discord components.
 *
 * @module bot
 */

import fs from 'fs';
import path from 'path';

import { Client, GatewayIntentBits, Collection } from 'discord.js';

import { env, validateRequiredEnvVars } from './config/env.js';

// Validate all required environment variables before starting
validateRequiredEnvVars();

/**
 * Discord client instance
 * Configured with Guilds intent for server interactions
 */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
/**
 * Collection of all loaded slash commands
 * Maps command names to their module exports
 * @type {Collection<string, Object>}
 */
client.commands = new Collection();

// Load all commands from /commands directory
const commandsDir = path.join(process.cwd(), 'bot', 'commands');
const commandFiles = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith('.js'));

// Import and register each command
for (const file of commandFiles) {
  const mod = await import(`./commands/${file}`);

  const name = mod?.data?.name;
  if (!name) {
    console.warn(`⚠️  Skipping ${file}: missing export 'data.name'`);
    continue;
  }

  // Add command to collection for lookup during interactions
  client.commands.set(name, mod);
}

// Load all events from /events directory
const eventDir = path.join(process.cwd(), 'bot', 'events');
const eventFiles = fs.readdirSync(eventDir).filter((f) => f.endsWith('.js'));
// Import and register each event handler
for (const file of eventFiles) {
  const mod = await import(`./events/${file}`);

  if (!mod?.name) {
    console.warn(`⚠️  Skipping event ${file}: missing export 'name'`);
    continue;
  }

  // Register event listener (once for single-fire events, on for repeating)
  if (mod?.once) {
    client.once(mod.name, (...args) => mod.execute(client, ...args));
  } else {
    client.on(mod.name, (...args) => mod.execute(client, ...args));
  }
}

// Connect to Discord using bot token
client.login(env.TOKEN);
