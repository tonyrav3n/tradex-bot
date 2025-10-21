import { decodeEventLog } from "viem";
import { publicClient } from "./client.js";
import { FACTORY_ABI, FACTORY_ADDRESS } from "./contract.js";

/**
 * Normalize an Ethereum address to lowercase.
 * @param {string | null | undefined} addr
 * @returns {string | null}
 */
function normalize(addr) {
  if (!addr || typeof addr !== "string") return null;
  return addr.toLowerCase();
}

/**
 * Attempt to convert an indexed topic (32-byte hex) into an address.
 * @param {string | undefined} topic - 0x-prefixed 32-byte hex
 * @returns {string | null} 0x-prefixed 20-byte address or null
 */
function addrFromTopic(topic) {
  if (!topic || typeof topic !== "string" || !topic.startsWith("0x")) {
    return null;
  }
  // Topics are 32 bytes; address is the lower 20 bytes
  const hex = topic.slice(2); // strip 0x
  if (hex.length !== 64) return null;
  const addr = "0x" + hex.slice(24);
  return addr.length === 42 ? addr : null;
}

/**
 * Returns true if the address has bytecode (i.e., is a contract).
 * @param {string} address
 * @returns {Promise<boolean>}
 */
async function hasBytecode(address) {
  try {
    const code = await publicClient.getBytecode({ address });
    return !!code && code !== "0x";
  } catch {
    return false;
  }
}

/**
 * Try to decode an EscrowCreated event using a provided ABI.
 * Extract potential escrow addresses from known argument keys.
 *
 * @param {import('viem').Log} log
 * @param {any[]} abi
 * @returns {string | null}
 */
function tryDecodeEscrowCreated(log, abi) {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded?.eventName !== "EscrowCreated") return null;

    const args = decoded?.args || {};
    const candidateKeys = [
      "escrowAddress",
      "escrowContract",
      "escrow",
      "escrowAddr",
    ];

    for (const key of candidateKeys) {
      const val = args[key];
      if (typeof val === "string" && val.startsWith("0x") && val.length === 42) {
        return val;
      }
    }
  } catch {
    // ignore decode errors and fallback to topic parsing
  }
  return null;
}

/**
 * Fallback to factory getters to retrieve the most recently created escrow.
 * @param {string} factoryAddress
 * @param {any[]} factoryAbi
 * @returns {Promise<string | null>}
 */
async function getLastEscrowFromFactory(factoryAddress, factoryAbi) {
  try {
    const count = await publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "getEscrowsCount",
      args: [],
    });
    if (!count || count <= 0n) return null;

    const lastIdx = count - 1n;
    const escrow = await publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "getEscrow",
      args: [lastIdx],
    });
    if (typeof escrow === "string" && escrow.startsWith("0x") && escrow.length === 42) {
      return escrow;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derive escrow address from logs robustly:
 * - Only consider logs emitted by the expected factory (when provided).
 * - Try ABI decode for EscrowCreated and known argument names.
 * - If ABI mismatch, scan indexed topics for addresses and choose the one with bytecode.
 * - As a last resort, read the last escrow from the factory getters.
 *
 * @param {Object} params
 * @param {import('viem').TransactionReceipt} [params.receipt]
 * @param {string} [params.txHash]
 * @param {string} [params.factoryAddress] - Defaults to FACTORY_ADDRESS
 * @param {any[]} [params.factoryAbi] - Defaults to FACTORY_ABI
 * @param {boolean} [params.allowFallbackRead=true] - If true, fallback to factory getters
 * @returns {Promise<string>} escrow address
 * @throws {Error} if unable to derive an escrow address
 */
export async function deriveEscrowAddress({
  receipt,
  txHash,
  factoryAddress = FACTORY_ADDRESS,
  factoryAbi = FACTORY_ABI,
  allowFallbackRead = true,
} = {}) {
  if (!receipt && !txHash) {
    throw new Error("deriveEscrowAddress: provide either receipt or txHash");
  }

  if (!receipt) {
    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
  if (!receipt || !Array.isArray(receipt.logs)) {
    throw new Error("deriveEscrowAddress: invalid transaction receipt");
  }

  const factoryAddrNorm = factoryAddress ? normalize(factoryAddress) : null;

  // 1) Filter logs to those emitted by the factory (if known)
  const relevantLogs = factoryAddrNorm
    ? receipt.logs.filter(
        (log) => log.address && normalize(log.address) === factoryAddrNorm,
      )
    : receipt.logs.slice();

  // 2) Try decoding with ABI and expected argument keys
  for (const log of relevantLogs) {
    const candidate = tryDecodeEscrowCreated(log, factoryAbi);
    if (candidate && (await hasBytecode(candidate))) {
      return candidate;
    }
  }

  // 3) ABI mismatch path: look at indexed topics for addresses and pick the contract one
  for (const log of relevantLogs) {
    const topics = Array.isArray(log.topics) ? log.topics : [];
    // topics[0] is signature, [1..3] are indexed params
    const candidates = [topics[1], topics[2], topics[3]]
      .map((t) => addrFromTopic(t))
      .filter(Boolean);

    for (const addr of candidates) {
      if (await hasBytecode(addr)) {
        return addr;
      }
    }
  }

  // 4) Final fallback: read latest escrow from factory
  if (allowFallbackRead && factoryAddrNorm) {
    const last = await getLastEscrowFromFactory(factoryAddress, factoryAbi);
    if (last && (await hasBytecode(last))) {
      return last;
    }
  }

  throw new Error(
    "deriveEscrowAddress: failed to derive escrow address from logs and factory",
  );
}

/**
 * Convenience: derive escrow address directly from a tx hash.
 * @param {string} txHash
 * @param {Object} [opts]
 * @returns {Promise<string>}
 */
export async function deriveEscrowAddressFromTx(txHash, opts = {}) {
  return deriveEscrowAddress({ txHash, ...opts });
}
