/**
 * Amis trade utilities for interacting with the AmisEscrowManager contract.
 *
 * Features:
 * - Create trades (createTrade) and derive tradeId from transaction receipt
 * - Reads: getTrade, getTradeStatus, getTradeState, getFeeConfig
 * - Writes (bot-only where applicable): markDelivered, approveDelivery, releaseAfterTimeout,
 *   openDispute, resolveDispute, cancelTrade
 * - Watchers for key events filtered by tradeId
 * - Helpers to compute buyer totals and release deadlines
 *
 * Notes:
 * - The contract model is "single manager + tradeId" (not per-escrow address).
 * - Buyer funds the trade by calling fund(tradeId) from their own wallet with the
 *   exact required value (amount + 2.5% buyer fee). The bot can provide the quote
 *   and call data, but should not send funds for the user.
 */

import { formatEther, Interface } from "ethers";
import { publicClient, walletClient, account } from "./client.js";
import { AMIS_ABI, AMIS_ADDRESS } from "./amisContract.js";
import {
  buyerTotalWeiFromBaseWei,
  computeReleaseDeadline,
  BPS_SCALE_BI,
  FEE_BPS_BI,
  TOTAL_FEE_BPS_BI,
  BOT_SHARE_BPS_BI,
} from "./fees.js";

/* ===========================
   Constants and enums
   =========================== */

export const AMIS_STATUS = Object.freeze({
  Created: 0,
  Funded: 1,
  Delivered: 2,
  Completed: 3,
  Cancelled: 4,
  Disputed: 5,
});

export function statusLabel(status) {
  switch (Number(status)) {
    case AMIS_STATUS.Created:
      return "Created";
    case AMIS_STATUS.Funded:
      return "Funded";
    case AMIS_STATUS.Delivered:
      return "Delivered";
    case AMIS_STATUS.Completed:
      return "Completed";
    case AMIS_STATUS.Cancelled:
      return "Cancelled";
    case AMIS_STATUS.Disputed:
      return "Disputed";
    default:
      return `Unknown (${status})`;
  }
}

/* ===========================
   Internal helpers
   =========================== */

function toBigIntOrThrow(v, name = "value") {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "string") return BigInt(v);
  } catch {
    // fallthrough
  }
  throw new Error(`${name} must be a bigint, number, or numeric string`);
}

function isAddress(addr) {
  return (
    typeof addr === "string" && addr.length === 42 && addr.startsWith("0x")
  );
}

/* ===========================
   Reads
   =========================== */

/**
 * Read full on-chain Trade struct.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<{ tradeId: bigint, buyer: string, seller: string, amount: bigint, status: number, deliveryTimestamp: bigint, pendingBotFee: bigint, pendingfeeReceiverFee: bigint }>}
 */
export async function getTrade(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  const res = await publicClient.readContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "trades",
    args: [id],
  });
  // ethers returns struct objects with both index-based and named properties; normalize to a consistent shape
  const obj =
    res && typeof res === "object"
      ? res
      : {
          tradeId: res?.[0],
          buyer: res?.[1],
          seller: res?.[2],
          amount: res?.[3],
          status: res?.[4],
          deliveryTimestamp: res?.[5],
          pendingBotFee: res?.[6],
          pendingfeeReceiverFee: res?.[7],
        };
  return {
    tradeId: BigInt(obj.tradeId ?? 0n),
    buyer: String(obj.buyer ?? "0x0000000000000000000000000000000000000000"),
    seller: String(obj.seller ?? "0x0000000000000000000000000000000000000000"),
    amount: BigInt(obj.amount ?? 0n),
    status: Number(obj.status ?? 0),
    deliveryTimestamp: BigInt(obj.deliveryTimestamp ?? 0n),
    pendingBotFee: BigInt(obj.pendingBotFee ?? 0n),
    pendingfeeReceiverFee: BigInt(obj.pendingfeeReceiverFee ?? 0n),
  };
}

/**
 * Read only the trade status enum value.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<number>}
 */
export async function getTradeStatus(tradeId) {
  const t = await getTrade(tradeId);
  return Number(t.status ?? 0);
}

/**
 * Read config constants and release timeout from contract.
 * @returns {Promise<{ FEE_BPS: bigint, TOTAL_FEE_BPS: bigint, BOT_SHARE_BPS: bigint, releaseTimeout: bigint }>}
 */
export async function getFeeConfig() {
  const [fee, total, botShare, timeout] = await Promise.all([
    publicClient.readContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "FEE_BPS",
      args: [],
    }),
    publicClient.readContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "TOTAL_FEE_BPS",
      args: [],
    }),
    publicClient.readContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "BOT_SHARE_BPS",
      args: [],
    }),
    publicClient.readContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "releaseTimeout",
      args: [],
    }),
  ]);
  return {
    FEE_BPS: BigInt(fee ?? FEE_BPS_BI),
    TOTAL_FEE_BPS: BigInt(total ?? TOTAL_FEE_BPS_BI),
    BOT_SHARE_BPS: BigInt(botShare ?? BOT_SHARE_BPS_BI),
    releaseTimeout: BigInt(timeout ?? 86400n),
  };
}

/**
 * Composite, UI-friendly state for a trade.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<{ tradeId: bigint, buyer: string, seller: string, amountWei: bigint, amountEth: string, status: number, statusText: string, deliveredAtSec: number, releaseTimeoutSec: number, deadlineSec: number|null, secondsLeft: number|null, canReleaseByTimeout: boolean }>}
 */
export async function getTradeState(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  const [{ buyer, seller, amount, status, deliveryTimestamp }, timeout] =
    await Promise.all([
      getTrade(id),
      getFeeConfig().then((c) => c.releaseTimeout),
    ]);

  const amountEth = formatEther(amount ?? 0n);
  const statusNum = Number(status ?? 0);
  const deliveredAtSec = Number(deliveryTimestamp ?? 0n);
  const releaseTimeoutSec = Number(timeout ?? 0n);

  const deadlineSec =
    deliveredAtSec > 0 && releaseTimeoutSec > 0
      ? computeReleaseDeadline(deliveredAtSec, releaseTimeoutSec)
      : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsLeft =
    deadlineSec !== null ? Math.max(0, Number(deadlineSec) - nowSec) : null;
  const canReleaseByTimeout =
    statusNum === AMIS_STATUS.Delivered &&
    deadlineSec !== null &&
    nowSec >= Number(deadlineSec);

  return {
    tradeId: id,
    buyer,
    seller,
    amountWei: amount ?? 0n,
    amountEth,
    status: statusNum,
    statusText: statusLabel(statusNum),
    deliveredAtSec,
    releaseTimeoutSec,
    deadlineSec: deadlineSec != null ? Number(deadlineSec) : null,
    secondsLeft,
    canReleaseByTimeout,
  };
}

/* ===========================
   Writes (bot account unless overridden)
   =========================== */

/**
 * Create a new trade (bot-only).
 * @param {string} buyer
 * @param {string} seller
 * @param {bigint|number|string} amountWei - base escrow amount (wei)
 * @returns {Promise<{ txHash: `0x${string}`, tradeId: bigint | null }>}
 */
export async function createTrade(buyer, seller, amountWei) {
  if (!isAddress(buyer)) throw new Error("createTrade: invalid buyer address");
  if (!isAddress(seller))
    throw new Error("createTrade: invalid seller address");
  const base = toBigIntOrThrow(amountWei, "amountWei");

  try {
    // Simulate to get the tradeId immediately (no need to wait for receipt)
    const sim = await publicClient.simulateContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "createTrade",
      account,
      args: [buyer, seller, base],
    });
    const txHash = await walletClient.writeContract(sim.request);
    const tradeId = sim?.result ?? null;
    return { txHash, tradeId };
  } catch {
    // Fallback: submit without simulation (tradeId will be derived elsewhere if needed)
    const txHash = await walletClient.writeContract({
      address: AMIS_ADDRESS,
      abi: AMIS_ABI,
      functionName: "createTrade",
      args: [buyer, seller, base],
    });
    return { txHash, tradeId: null };
  }
}

/**
 * Build the fund(tradeId) transaction request for the buyer, including the required value.
 * Returns { to, data, value } that the buyer should broadcast from their wallet.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<{ to: string, data: `0x${string}`, value: bigint, functionName: string }>}
 */
export async function buildFundRequest(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  const t = await getTrade(id);
  const value = buyerTotalWeiFromBaseWei(t.amount);
  // Encode the calldata for fund(tradeId)
  // Encode fund(tradeId) calldata via ethers Interface
  const iface = new Interface(["function fund(uint256 tradeId) payable"]);
  const data = iface.encodeFunctionData("fund", [id]);
  return {
    to: AMIS_ADDRESS,
    data,
    value,
    functionName: "fund",
  };
}

/**
 * Mark delivered (bot-only).
 * @param {bigint|number|string} tradeId
 * @returns {Promise<`0x${string}`>}
 */
export async function markDelivered(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "markDelivered",
    args: [id],
  });
}

/**
 * Approve delivery and release funds (bot-only).
 * @param {bigint|number|string} tradeId
 * @returns {Promise<`0x${string}`>}
 */
export async function approveDelivery(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "approveDelivery",
    args: [id],
  });
}

/**
 * Release after timeout (bot-only).
 * @param {bigint|number|string} tradeId
 * @returns {Promise<`0x${string}`>}
 */
export async function releaseAfterTimeout(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "releaseAfterTimeout",
    args: [id],
  });
}

/**
 * Open dispute (bot-only).
 * @param {bigint|number|string} tradeId
 * @param {string} raisedBy - address of buyer or seller
 * @returns {Promise<`0x${string}`>}
 */
export async function openDispute(tradeId, raisedBy) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  if (!isAddress(raisedBy))
    throw new Error("openDispute: invalid raisedBy address");
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "openDispute",
    args: [id, raisedBy],
  });
}

/**
 * Resolve dispute with a fee-neutral split of the distributable base (bot-only).
 * buyerShareBps + sellerShareBps must equal 10000.
 * @param {bigint|number|string} tradeId
 * @param {bigint|number|string} buyerShareBps
 * @param {bigint|number|string} sellerShareBps
 * @returns {Promise<`0x${string}`>}
 */
export async function resolveDispute(tradeId, buyerShareBps, sellerShareBps) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  const b = toBigIntOrThrow(buyerShareBps, "buyerShareBps");
  const s = toBigIntOrThrow(sellerShareBps, "sellerShareBps");
  if (b + s !== 10000n) {
    throw new Error(
      "resolveDispute: buyerShareBps + sellerShareBps must equal 10000",
    );
  }
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "resolveDispute",
    args: [id, b, s],
  });
}

/**
 * Cancel trade (bot-only; only in Created state).
 * @param {bigint|number|string} tradeId
 * @returns {Promise<`0x${string}`>}
 */
export async function cancelTrade(tradeId) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  return walletClient.writeContract({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    functionName: "cancelTrade",
    args: [id],
  });
}

/* ===========================
   Watchers
   =========================== */

/**
 * Watch Funded events for a specific tradeId.
 * handler({ tradeId, buyer, amountWei, amountEth, txHash })
 * @param {bigint|number|string} tradeId
 * @param {(e: { tradeId: bigint, buyer: string, amountWei: bigint, amountEth: string, txHash: `0x${string}` }) => Promise<void>|void} handler
 * @param {{ emitOnStart?: boolean }} [options]
 * @returns {() => void} unwatch
 */
export function watchFunded(tradeId, handler, options = {}) {
  const id = toBigIntOrThrow(tradeId, "tradeId");
  const unwatch = publicClient.watchContractEvent({
    address: AMIS_ADDRESS,
    abi: AMIS_ABI,
    eventName: "Funded",
    args: { tradeId: id },
    onLogs: async (logs) => {
      for (const log of logs) {
        const buyer = log.args?.buyer;
        const amountWei = BigInt(log.args?.amount ?? 0n);
        const amountEth = formatEther(amountWei);
        await handler({
          tradeId: id,
          buyer,
          amountWei,
          amountEth,
          txHash: log.transactionHash,
        });
      }
    },
    onError: (err) => {
      console.error("Amis watcher error (Funded):", err);
    },
  });

  if (options.emitOnStart) {
    (async () => {
      try {
        const t = await getTrade(id);
        if (Number(t.status) === AMIS_STATUS.Funded) {
          await handler({
            tradeId: id,
            buyer: t.buyer,
            amountWei: t.amount ?? 0n,
            amountEth: formatEther(t.amount ?? 0n),
            txHash: "0x",
          });
        }
      } catch (e) {
        console.warn("watchFunded emitOnStart failed:", e);
      }
    })();
  }

  return () => {
    try {
      if (typeof unwatch === "function") unwatch();
    } catch (e) {
      console.error("Amis unwatch cleanup failed:", e);
    }
  };
}

/* ===========================
   Tx helpers
   =========================== */

/**
 * Derive tradeId from a createTrade tx hash by decoding the Created event.
 * @param {`0x${string}`} txHash
 * @returns {Promise<bigint>}
 */
export async function deriveTradeIdFromTx(txHash) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  if (!receipt || !Array.isArray(receipt.logs)) {
    throw new Error("deriveTradeIdFromTx: invalid receipt");
  }

  // Try strict decode first using ABI
  for (const log of receipt.logs) {
    try {
      const iface = new Interface(AMIS_ABI);
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "Created") {
          const tradeId = BigInt(parsed?.args?.tradeId ?? 0n);
          if (tradeId > 0n) return tradeId;
        }
      } catch {
        // ignore
      }
    } catch {
      // fallthrough
    }
  }

  // Fallback: attempt parsing with a minimal ABI item (robust to artifact differences)
  const fallbackIface = new Interface([
    "event Created(uint256 indexed tradeId, address indexed buyer, address indexed seller, uint256 amount)",
  ]);
  for (const log of receipt.logs) {
    try {
      const parsed = fallbackIface.parseLog(log);
      if (parsed?.name === "Created") {
        const tradeId = BigInt(parsed?.args?.tradeId ?? 0n);
        if (tradeId > 0n) return tradeId;
      }
    } catch {
      // ignore
    }
  }

  throw new Error("deriveTradeIdFromTx: Created event not found");
}

/* ===========================
   Convenience exports
   =========================== */

/**
 * Compute the buyer's required total (wei) for a given trade.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<bigint>}
 */
export async function getBuyerTotalWei(tradeId) {
  const t = await getTrade(tradeId);
  return buyerTotalWeiFromBaseWei(t.amount ?? 0n);
}

/**
 * Summarize the current fee config as human-friendly numbers (percentage points).
 * @returns {Promise<{ buyerFeePct: number, sellerFeePct: number, totalFeePct: number, botShareOfFeePct: number }>}
 */
export async function getFeeConfigSummary() {
  const c = await getFeeConfig();
  const buyer = Number(c.FEE_BPS) / Number(BPS_SCALE_BI);
  const seller = Number(c.FEE_BPS) / Number(BPS_SCALE_BI);
  const total = Number(c.TOTAL_FEE_BPS) / Number(BPS_SCALE_BI);
  const botShareOfFee = Number(c.BOT_SHARE_BPS) / Number(BPS_SCALE_BI); // as fraction of total fee side
  return {
    buyerFeePct: buyer * 100,
    sellerFeePct: seller * 100,
    totalFeePct: total * 100,
    botShareOfFeePct: botShareOfFee * 100,
  };
}

export default {
  // enums
  AMIS_STATUS,
  statusLabel,

  // reads
  getTrade,
  getTradeStatus,
  getTradeState,
  getFeeConfig,
  getBuyerTotalWei,
  getFeeConfigSummary,

  // writes
  createTrade,
  buildFundRequest,
  markDelivered,
  approveDelivery,
  releaseAfterTimeout,
  openDispute,
  resolveDispute,
  cancelTrade,

  // watchers
  watchFunded,

  // tx helpers
  deriveTradeIdFromTx,
};
