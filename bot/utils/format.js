/* tradenest-discord/bot/utils/format.js
Extracted number formatting and link helpers for use across embeds and messages.

Features:
- Safe number parsing and decimal formatting with trimmed trailing zeros
- ETH/wei conversions (BigInt-precise)
- Convenience ETH/USD formatters
- Discord timestamp helpers (<t:...:F>, <t:...:R>)
- Etherscan link builders (address/contract/tx) with chain-aware base URL

Note:
- This module is side-effect free. It reads process.env.NETWORK_CHAIN_ID only when
  building Etherscan URLs, and gracefully falls back if absent.
*/

const WEI_PER_ETH = 10n ** 18n;

/**
 * Attempt to parse a loose numeric input (number or string).
 * - Trims whitespace
 * - Removes commas
 * - Strips non-numeric characters except digits, dot, +/-
 * Returns NaN if parsing fails.
 */
export function toNumberLoose(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "bigint") return Number(value); // may overflow if very large; intended for UI only
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "").replace(/[^\d.+-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Format a decimal number to a fixed number of places without scientific notation,
 * trimming trailing zeros. Keeps at least one decimal if necessary.
 */
export function formatDecimal(n, decimals) {
  const num = typeof n === "number" ? n : toNumberLoose(n);
  if (!Number.isFinite(num)) return "0";
  const d = Math.max(0, Math.min(18, Math.floor(decimals ?? 0)));
  const s = num.toFixed(d);
  if (d === 0) return s;
  return s
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, ".0")
    .replace(/\.$/u, "");
}

/**
 * Format an ETH amount (number/string) to a human string (default: 6 decimals).
 */
export function formatEth(amount, decimals = 6) {
  return formatDecimal(toNumberLoose(amount), decimals);
}

/**
 * Format a USD amount (number/string) to a human string with 2 decimals.
 */
export function formatUsd(amount, decimals = 2) {
  return formatDecimal(toNumberLoose(amount), decimals);
}

/**
 * Convert a decimal ETH (number|string) into wei (BigInt).
 * Accepts up to 18 fractional digits; excess is truncated (not rounded).
 */
export function ethToWeiBigInt(ethInput) {
  if (typeof ethInput === "bigint") return ethInput * WEI_PER_ETH;
  const s = String(ethInput ?? "").trim();
  if (s.length === 0) return 0n;
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const parts = abs.split(".");
  const intPart = parts[0] || "0";
  const fracPartRaw = (parts[1] || "").replace(/_/g, "");
  const fracPart = (fracPartRaw + "0".repeat(18)).slice(0, 18);

  if (!/^\d+$/.test(intPart) || !/^\d{0,18}$/.test(fracPart)) {
    throw new Error("ethToWeiBigInt: invalid numeric input");
  }

  const intWei = BigInt(intPart) * WEI_PER_ETH;
  const fracWei = BigInt(fracPart);
  const res = intWei + fracWei;
  return negative ? -res : res;
}

/**
 * Convert wei (BigInt|string|number) to an ETH string with a fixed number of decimals.
 */
export function weiToEthString(weiInput, decimals = 6) {
  let wei;
  if (typeof weiInput === "bigint") {
    wei = weiInput;
  } else if (typeof weiInput === "number") {
    if (!Number.isFinite(weiInput)) return "0";
    wei = BigInt(Math.trunc(weiInput));
  } else if (typeof weiInput === "string") {
    if (!/^-?\d+$/.test(weiInput.trim())) return "0";
    wei = BigInt(weiInput.trim());
  } else {
    return "0";
  }

  const negative = wei < 0n;
  const absWei = negative ? -wei : wei;

  const intPart = absWei / WEI_PER_ETH;
  let fracPart = (absWei % WEI_PER_ETH).toString().padStart(18, "0");

  // Slice to requested decimals (no rounding)
  const frac = decimals > 0 ? fracPart.slice(0, Math.min(18, decimals)) : "";
  const raw = decimals > 0 ? `${intPart}.${frac}` : `${intPart}`;
  const trimmed =
    decimals > 0
      ? raw
          .replace(/(\.\d*?[1-9])0+$/u, "$1")
          .replace(/\.0+$/u, ".0")
          .replace(/\.$/u, "")
      : raw;

  return negative ? `-${trimmed}` : trimmed;
}

/**
 * Format a unix timestamp (seconds) as a Discord absolute time tag: <t:...:F>
 */
export function discordTimeAbsolute(unixSeconds) {
  const t = Math.max(0, Math.floor(Number(unixSeconds) || 0));
  return `<t:${t}:F>`;
}

/**
 * Format a unix timestamp (seconds) as a Discord relative time tag: <t:...:R>
 */
export function discordTimeRelative(unixSeconds) {
  const t = Math.max(0, Math.floor(Number(unixSeconds) || 0));
  return `<t:${t}:R>`;
}

/* ===========================
   Etherscan link builders
   =========================== */

/**
 * Resolve etherscan base URL by chain id.
 * - 1: https://etherscan.io
 * - 11155111: https://sepolia.etherscan.io
 * - 17000: https://holesky.etherscan.io
 * Fallback: https://etherscan.io
 */
export function etherscanBaseUrl(chainId) {
  const id =
    typeof chainId === "number" && Number.isFinite(chainId)
      ? chainId
      : Number(process.env.NETWORK_CHAIN_ID || 0);
  switch (id) {
    case 1:
      return "https://etherscan.io";
    case 11155111:
      return "https://sepolia.etherscan.io";
    case 17000:
      return "https://holesky.etherscan.io";
    default:
      return "https://etherscan.io";
  }
}

/**
 * Build an Etherscan address URL for the current (or provided) chain id.
 */
export function buildEtherscanAddressUrl(address, chainId) {
  const base = etherscanBaseUrl(chainId);
  return `${base}/address/${String(address)}`;
}

/**
 * Alias for address URL (contracts are also at /address).
 */
export function buildEtherscanContractUrl(address, chainId) {
  return buildEtherscanAddressUrl(address, chainId);
}

/**
 * Build an Etherscan transaction URL for the current (or provided) chain id.
 */
export function buildEtherscanTxUrl(txHash, chainId) {
  const base = etherscanBaseUrl(chainId);
  return `${base}/tx/${String(txHash)}`;
}

/* ===========================
   Aggregated export
   =========================== */

export default {
  // parsing/formatting
  toNumberLoose,
  formatDecimal,
  formatEth,
  formatUsd,

  // conversions
  ethToWeiBigInt,
  weiToEthString,

  // discord time helpers
  discordTimeAbsolute,
  discordTimeRelative,

  // etherscan
  etherscanBaseUrl,
  buildEtherscanAddressUrl,
  buildEtherscanContractUrl,
  buildEtherscanTxUrl,
};
