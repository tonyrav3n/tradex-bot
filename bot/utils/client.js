import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;

if (!SEPOLIA_PRIVATE_KEY) {
  console.error("❌ Missing SEPOLIA_PRIVATE_KEY in .env");
  process.exit(1);
}
if (!RPC_URL) {
  console.error("❌ Missing SEPOLIA_RPC_URL (or RPC_URL) in .env");
  process.exit(1);
}

export const account = privateKeyToAccount(SEPOLIA_PRIVATE_KEY);

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

console.log("✅ Wallet client ready:", account.address);
