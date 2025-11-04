import dotenv from "dotenv";
import { isAddress, getAddress } from "viem";
import { publicClient } from "./client.js";

dotenv.config();

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Return a friendly error message for invalid address input.
 */
function invalidFormatError() {
  return "Invalid address. Please paste a 0x-prefixed Ethereum address.";
}

function zeroAddressError() {
  return "Zero address is not allowed. Please provide a valid wallet address.";
}

function contractAddressError() {
  return "This appears to be a contract address. Please provide a regular wallet (EOA) address.";
}

function networkValidationError() {
  return "Could not validate the address on-chain. Please try again in a moment.";
}

/**
 * Check if the provided address is the zero address.
 * @param {string} addr
 */
export function isZeroAddress(addr) {
  try {
    return getAddress(addr) === ZERO_ADDRESS;
  } catch {
    return false;
  }
}

/**
 * Check if an address is an EOA (i.e., not a contract) by verifying it has no bytecode.
 * @param {string} checksumAddress - EIP-55 checksummed address
 * @returns {Promise<{ ok: boolean, isEoa?: boolean, error?: string }>}
 */
export async function checkEoa(checksumAddress) {
  try {
    const code = await publicClient.getBytecode({ address: checksumAddress });
    // If code is "0x" or null/undefined, then it's an EOA
    const isEoa = !code || code === "0x";
    return { ok: true, isEoa };
  } catch {
    return { ok: false, error: networkValidationError() };
  }
}

/**
 * Normalize and validate an Ethereum address with optional EOA enforcement.
 *
 * Behavior:
 * - Syntactic validation via viem's isAddress.
 * - Normalization to EIP-55 checksummed format via viem's getAddress.
 * - Rejects zero address.
 * - If enforceEoa=true, rejects contract addresses (non-empty bytecode).
 *
 * @param {string} input
 * @param {{ enforceEoa?: boolean }} [options]
 * @returns {Promise<{ ok: true, address: string } | { ok: false, error: string }>}
 */
export async function normalizeAndValidateAddress(input, options = {}) {
  const enforceEoa =
    options.enforceEoa !== undefined ? options.enforceEoa : true;

  if (typeof input !== "string") {
    return { ok: false, error: invalidFormatError() };
  }

  const raw = input.trim();

  if (!isAddress(raw)) {
    return { ok: false, error: invalidFormatError() };
  }

  let checksumAddress;
  try {
    checksumAddress = getAddress(raw); // EIP-55 checksummed
  } catch {
    return { ok: false, error: invalidFormatError() };
  }

  if (checksumAddress === ZERO_ADDRESS) {
    return { ok: false, error: zeroAddressError() };
  }

  if (enforceEoa) {
    const eoaCheck = await checkEoa(checksumAddress);
    if (!eoaCheck.ok) {
      return { ok: false, error: eoaCheck.error || networkValidationError() };
    }
    if (!eoaCheck.isEoa) {
      return { ok: false, error: contractAddressError() };
    }
  }

  return { ok: true, address: checksumAddress };
}

/**
 * Throwing variant of normalizeAndValidateAddress.
 * @param {string} input
 * @param {{ enforceEoa?: boolean }} [options]
 * @returns {Promise<string>} checksummed address
 * @throws Error with a user-friendly message
 */
export async function requireValidAddress(input, options = {}) {
  const res = await normalizeAndValidateAddress(input, options);
  if (!res.ok) {
    throw new Error(res.error || invalidFormatError());
  }
  return res.address;
}

/**
 * Normalize a USD amount input.
 *
 * Accepts formats like:
 * - "$10", "$10.5", "10", "10.5", "1,234.56"
 * - With or without whitespace
 *
 * Returns a normalized string with two decimals for safe DB insertion into NUMERIC(18,2).
 *
 * @param {string|number} input
 * @returns {{ ok: true, value: string, number: number } | { ok: false, error: string }}
 */
export function normalizeUsdAmount(input) {
  if (input === undefined || input === null) {
    return { ok: false, error: "Enter a USD amount." };
  }

  let raw = String(input).trim();

  // Remove spaces, optional leading '$', and thousands separators
  raw = raw.replace(/\s+/g, "");
  if (raw.startsWith("$")) raw = raw.slice(1);
  raw = raw.replace(/,/g, "");

  // Accept digits with optional decimal part; allow trailing dot (e.g., "10.")
  if (!/^\d+(\.\d*)?$/.test(raw)) {
    return {
      ok: false,
      error: "Enter a valid USD amount, e.g. 10, 10.5, $10, $10.50",
    };
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, error: "Enter a valid USD amount." };
  }
  if (num < 5) {
    return { ok: false, error: "Minimum trade amount is $5.00" };
  }

  // Normalize to 2 decimals to match NUMERIC(18,2)
  const value = num.toFixed(2);
  return { ok: true, value, number: num };
}

/**
 * Throwing variant of normalizeUsdAmount.
 * @param {string|number} input
 * @returns {string} normalized value with two decimals
 * @throws Error with a user-friendly message
 */
export function requireUsdAmount(input) {
  const res = normalizeUsdAmount(input);
  if (!res.ok) {
    throw new Error(res.error || "Enter a valid USD amount.");
  }
  return res.value;
}
