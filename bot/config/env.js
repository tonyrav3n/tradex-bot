/**
 * Environment configuration module
 *
 * Loads and exports all environment variables required by the bot.
 * Variables are loaded from .env file using dotenv.
 *
 * All values are trimmed of whitespace and validated before use.
 * Use validateRequiredEnvVars() to ensure all required variables are set.
 *
 * @module config/env
 */

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ quiet: true });

/**
 * Environment variables object
 *
 * Contains all configuration values loaded from environment.
 * All string values are trimmed, numeric values are parsed.
 *
 * @type {Object}
 * @property {string} TOKEN - Discord bot token for authentication
 * @property {string} GUILD_ID - Discord guild (server) ID for command registration
 * @property {string} ADMIN_ROLE_ID - Role ID for admin permissions
 * @property {string} NETWORK_PRIVATE_KEY - Private key for blockchain transactions
 * @property {string} NETWORK_RPC_URL - RPC URL for blockchain network connection
 * @property {number} NETWORK_CHAIN_ID - Chain ID for blockchain network
 * @property {string} VERIFIED_ROLE_ID - Role ID to assign to verified users
 * @property {string} BOT_ADDRESS - Bot's blockchain wallet address
 * @property {string} ETHERSCAN_API_KEY - API key for Etherscan/block explorer
 * @property {string} AMIS_ESCROW_ADDRESS - Smart contract address for escrow
 * @property {string} DATABASE_URL - Database connection URL
 * @property {string} DATABASE_SSL - Database SSL configuration
 * @property {boolean} DEBUG_MODE - Enable/disable debug logging (from DEBUG_MODE env var)
 */
export const env = {
  TOKEN: process.env.TOKEN?.trim() || '',
  GUILD_ID: process.env.GUILD_ID?.trim() || '',
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID?.trim() || '',
  NETWORK_PRIVATE_KEY: process.env.NETWORK_PRIVATE_KEY?.trim() || '',
  NETWORK_RPC_URL: process.env.NETWORK_RPC_URL?.trim() || '',
  NETWORK_CHAIN_ID: Number(process.env.NETWORK_CHAIN_ID) || 0,
  VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID?.trim() || '',
  BOT_ADDRESS: process.env.BOT_ADDRESS?.trim() || '',
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY?.trim() || '',
  AMIS_ESCROW_ADDRESS: process.env.AMIS_ESCROW_ADDRESS?.trim() || '',
  DATABASE_URL: process.env.DATABASE_URL?.trim() || '',
  DATABASE_SSL: process.env.DATABASE_SSL?.trim() || '',
  DEBUG_MODE: process.env.DEBUG_MODE?.trim().toLowerCase() === 'true',
};

/**
 * Validate that all required environment variables are set
 *
 * Checks each property in the env object and throws an error if any are missing.
 * Call this at application startup to fail fast if configuration is incomplete.
 *
 * @throws {Error} If any required environment variables are missing
 *
 * @example
 * try {
 *   validateRequiredEnvVars();
 * } catch (error) {
 *   console.error('Configuration error:', error.message);
 *   process.exit(1);
 * }
 */
export function validateRequiredEnvVars() {
  // Check all env properties for missing values
  const missing = Object.entries(env)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  // Throw error with list of missing variables
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
