import dotenv from 'dotenv';

dotenv.config({ quiet: true });

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
};

export function validateRequiredEnvVars() {
  const missing = Object.entries(env)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
