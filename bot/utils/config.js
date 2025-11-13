import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const config = {
  TOKEN: process.env.TOKEN || '',
  GUILD_ID: process.env.GUILD_ID || '',
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID || '',
  NETWORK_PRIVATE_KEY: process.env.NETWORK_PRIVATE_KEY || '',
  NETWORK_RPC_URL: process.env.NETWORK_RPC_URL || '',
  NETWORK_CHAIN_ID: Number(process.env.NETWORK_CHAIN_ID) || 0,
  VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID || '',
  BOT_ADDRESS: process.env.BOT_ADDRESS || '',
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || '',
  AMIS_ESCROW_ADDRESS: process.env.AMIS_ESCROW_ADDRESS || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_SSL: process.env.DATABASE_SSL || '',
};

export function validateRequiredEnvVars() {
  const missing = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
