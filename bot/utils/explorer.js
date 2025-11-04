/**
 * Explorer URL helpers for addresses, transactions, tokens, and blocks.
 *
 * Strategy:
 * - Prefer explicit EXPLORER_BASE_URL when provided (e.g., https://sepolia.etherscan.io)
 * - Otherwise infer from NETWORK_CHAIN_ID using a curated map of common explorers
 * - Fall back to Etherscan mainnet if nothing else is available
 *
 * Environment variables:
 * - EXPLORER_BASE_URL (optional): overrides auto-detection entirely
 * - NETWORK_CHAIN_ID (optional, number): used to select a default explorer
 *
 * Examples:
 *   addressUrl("0xabc...")  -> https://sepolia.etherscan.io/address/0xabc...
 *   txUrl("0xhash...")       -> https://sepolia.etherscan.io/tx/0xhash...
 *   tokenUrl("0xabc...")     -> https://sepolia.etherscan.io/token/0xabc...
 *   blockUrl(123456n)        -> https://sepolia.etherscan.io/block/123456
 */

const RAW_CHAIN_ID = process.env.NETWORK_CHAIN_ID;
const CHAIN_ID = Number.isFinite(Number(RAW_CHAIN_ID))
  ? Number(RAW_CHAIN_ID)
  : undefined;

const ENV_EXPLORER_BASE = String(process.env.EXPLORER_BASE_URL || "").trim();

/**
 * Known explorers by EVM chain id.
 * Note: This is non-exhaustive, but covers common networks. You can override with EXPLORER_BASE_URL.
 */
const EXPLORERS_BY_CHAIN_ID = Object.freeze({
  // Ethereum
  1: "https://etherscan.io",
  5: "https://goerli.etherscan.io", // legacy testnet
  11155111: "https://sepolia.etherscan.io",

  // Arbitrum
  42161: "https://arbiscan.io",
  421614: "https://sepolia.arbiscan.io",

  // Optimism
  10: "https://optimistic.etherscan.io",

  // Base
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",

  // Polygon
  137: "https://polygonscan.com",
  80002: "https://amoy.polygonscan.com",

  // BNB Chain
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com",

  // Scroll
  534352: "https://scrollscan.com",
  534351: "https://sepolia.scrollscan.com",

  // Linea
  59144: "https://lineascan.build",
  59141: "https://sepolia.lineascan.build",
});

/**
 * Normalize a base URL (strip trailing slashes).
 * @param {string} url
 * @returns {string}
 */
function normalizeBase(url) {
  return String(url || "").replace(/\/+$/u, "");
}

/**
 * Join base and path with exactly one slash at the boundary.
 * @param {string} base
 * @param {string} path
 * @returns {string}
 */
function join(base, path) {
  const b = normalizeBase(base);
  const p = String(path || "").replace(/^\/+/u, "");
  return `${b}/${p}`;
}

/**
 * Resolve the explorer base URL.
 * Preference order:
 * 1) EXPLORER_BASE_URL env var
 * 2) Known explorer from mapping by NETWORK_CHAIN_ID
 * 3) Etherscan mainnet as fallback
 * @returns {{ baseUrl: string, source: 'env'|'mapping'|'fallback', chainId?: number }}
 */
export function getExplorerConfig() {
  if (ENV_EXPLORER_BASE) {
    return { baseUrl: normalizeBase(ENV_EXPLORER_BASE), source: "env", chainId: CHAIN_ID };
  }
  if (CHAIN_ID && EXPLORERS_BY_CHAIN_ID[CHAIN_ID]) {
    return {
      baseUrl: normalizeBase(EXPLORERS_BY_CHAIN_ID[CHAIN_ID]),
      source: "mapping",
      chainId: CHAIN_ID,
    };
  }
  return { baseUrl: "https://etherscan.io", source: "fallback", chainId: CHAIN_ID };
}

/**
 * Get the explorer base URL string directly.
 * @returns {string}
 */
export function getExplorerBaseUrl() {
  return getExplorerConfig().baseUrl;
}

/**
 * Build an address URL for the current chain explorer.
 * @param {string} address
 * @returns {string}
 */
export function addressUrl(address) {
  const base = getExplorerBaseUrl();
  return join(base, `/address/${String(address)}`);
}

/**
 * Build a transaction URL for the current chain explorer.
 * @param {string} txHash
 * @returns {string}
 */
export function txUrl(txHash) {
  const base = getExplorerBaseUrl();
  return join(base, `/tx/${String(txHash)}`);
}

/**
 * Build a token URL for the current chain explorer.
 * @param {string} tokenAddress
 * @returns {string}
 */
export function tokenUrl(tokenAddress) {
  const base = getExplorerBaseUrl();
  return join(base, `/token/${String(tokenAddress)}`);
}

/**
 * Build a block URL for the current chain explorer.
 * @param {number|string|bigint} blockNumber
 * @returns {string}
 */
export function blockUrl(blockNumber) {
  const base = getExplorerBaseUrl();
  const n =
    typeof blockNumber === "bigint"
      ? blockNumber.toString()
      : String(blockNumber).replace(/[^\d]/g, "");
  return join(base, `/block/${n}`);
}

/**
 * Optional label for the explorer (based on base URL).
 * @returns {string}
 */
export function explorerLabel() {
  const { baseUrl } = getExplorerConfig();
  try {
    const host = new URL(baseUrl).host;
    // Simple host-to-label mapping
    if (host.includes("etherscan")) return "Etherscan";
    if (host.includes("arbiscan")) return "Arbiscan";
    if (host.includes("basescan")) return "Basescan";
    if (host.includes("polygonscan")) return "Polygonscan";
    if (host.includes("bscscan")) return "BscScan";
    if (host.includes("scrollscan")) return "Scrollscan";
    if (host.includes("lineascan")) return "Lineascan";
    if (host.includes("blockscout")) return "Blockscout";
    return host;
  } catch {
    return baseUrl;
  }
}

export default {
  getExplorerConfig,
  getExplorerBaseUrl,
  addressUrl,
  txUrl,
  tokenUrl,
  blockUrl,
  explorerLabel,
};
