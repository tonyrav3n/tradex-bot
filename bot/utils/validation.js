import dotenv from "dotenv";
import { isAddress, getAddress } from "viem";
import { publicClient } from "./client.js";

dotenv.config();

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Determine whether EOA enforcement is enabled via environment.
 * ADDRESS_ENFORCE_EOA=true to require EOAs (non-contract addresses).
 */
function envEnforceEoa() {
  return String(process.env.ADDRESS_ENFORCE_EOA || "")
    .trim()
    .toLowerCase() === "true";
}

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
    options.enforceEoa !== undefined ? options.enforceEoa : envEnforceEoa();

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
