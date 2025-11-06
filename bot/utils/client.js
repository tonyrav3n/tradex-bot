import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

const NETWORK_PRIVATE_KEY = process.env.NETWORK_PRIVATE_KEY;
const NETWORK_RPC_URL = process.env.NETWORK_RPC_URL;
export const NETWORK_CHAIN_ID = Number(process.env.NETWORK_CHAIN_ID);

if (!NETWORK_PRIVATE_KEY) {
  console.error("❌ Missing NETWORK_PRIVATE_KEY in .env");
  process.exit(1);
}
if (!NETWORK_RPC_URL) {
  console.error("❌ Missing NETWORK_RPC_URL in .env");
  process.exit(1);
}
if (!Number.isFinite(NETWORK_CHAIN_ID)) {
  console.error("❌ Missing NETWORK_CHAIN_ID in .env");
  process.exit(1);
}

export const account = privateKeyToAccount(NETWORK_PRIVATE_KEY);
const availableChains = Object.values(chains).filter(
  (c) => c && typeof c === "object" && typeof c.id === "number",
);
export const resolvedChain = availableChains.find(
  (c) => c.id === NETWORK_CHAIN_ID,
) || {
  id: NETWORK_CHAIN_ID,
  name: `chain-${NETWORK_CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [NETWORK_RPC_URL] },
    public: { http: [NETWORK_RPC_URL] },
  },
};

export const walletClient = createWalletClient({
  account,
  chain: resolvedChain,
  transport: http(NETWORK_RPC_URL, {
    timeout: 30000,
    retryCount: 10,
    retryDelay: 1000,
  }),
});

export const publicClient = createPublicClient({
  chain: resolvedChain,
  transport: http(NETWORK_RPC_URL, {
    timeout: 30000,
    retryCount: 10,
    retryDelay: 1000,
  }),
});

export function getExplorerBaseUrl() {
  const url = resolvedChain?.blockExplorers?.default?.url;
  if (url) return url;
  switch (NETWORK_CHAIN_ID) {
    case 1:
      return "https://etherscan.io";
    case 11155111:
      return "https://sepolia.etherscan.io";
    default:
      return "https://etherscan.io";
  }
}
export function explorerAddressUrl(address) {
  return `${getExplorerBaseUrl()}/address/${address}`;
}
export function explorerTxUrl(hash) {
  return `${getExplorerBaseUrl()}/tx/${hash}`;
}

console.log("✅ Wallet client ready:", account.address);
