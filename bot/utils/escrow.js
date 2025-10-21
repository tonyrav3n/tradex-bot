tradenest-discord/bot/utils/escrow.js
```
```tradenest-discord/bot/utils/escrow.js
/**
 * Escrow utilities: ABI, status mapping, and event watchers.
 *
 * Responsibilities:
 * - Provide the Escrow ABI (subset needed by the bot).
 * - Map numeric status to readable labels (and optional colors).
 * - Read current escrow state (status, amount, buyer, seller).
 * - Watch for Funded events to trigger UI/embed updates.
 *
 * Usage example:
 *   import {
 *     ESCROW_ABI,
 *     ESCROW_STATUS,
 *     statusLabel,
 *     getEscrowState,
 *     watchEscrowFunded,
 *   } from "./escrow.js";
 *
 *   // Start watching 'Funded' for a given escrow
 *   const unwatch = watchEscrowFunded(escrowAddress, async ({ buyer, amountWei, txHash }) => {
 *     const state = await getEscrowState(escrowAddress);
 *     // -> Update your embed to "Funded" using statusLabel(state.status) and amount
 *   }, { emitOnStart: true });
 *
 *   // Later:
 *   unwatch();
 */

import { publicClient } from "./client.js";
import { formatEther } from "viem";

// Minimal ABI: events + views used by the bot
export const ESCROW_ABI = [
  // --- Events ---
  {
    type: "event",
    name: "Funded",
    inputs: [
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Delivered",
    inputs: [{ indexed: true, name: "seller", type: "address" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "Approved",
    inputs: [{ indexed: true, name: "buyer", type: "address" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    anonymous: false,
  },

  // --- Views ---
  {
    type: "function",
    stateMutability: "view",
    name: "buyer",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "seller",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "amount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // enum TradeStatus { Created, Funded, Delivered, Completed, Cancelled, Disputed }
    type: "function",
    stateMutability: "view",
    name: "status",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },

  // --- Functions (reference) ---
  // Not used for watching but kept here for completeness and potential future writes.
  {
    type: "function",
    stateMutability: "payable",
    name: "fund",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "markDelivered",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "approveDelivery",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "releaseAfterTimeout",
    inputs: [],
    outputs: [],
  },
];

// Numeric status mapping (mirror TradeStatus enum in the contract)
export const ESCROW_STATUS = Object.freeze({
  Created: 0,
  Funded: 1,
  Delivered: 2,
  Completed: 3,
  Cancelled: 4,
  Disputed: 5,
});

// Optional color mapping for embeds (Discord hex colors)
export const ESCROW_STATUS_COLORS = Object.freeze({
  [ESCROW_STATUS.Created]: 0x95a5a6, // gray
  [ESCROW_STATUS.Funded]: 0x2ecc71, // green
  [ESCROW_STATUS.Delivered]: 0xf1c40f, // yellow
  [ESCROW_STATUS.Completed]: 0x3498db, // blue
  [ESCROW_STATUS.Cancelled]: 0xe74c3c, // red
  [ESCROW_STATUS.Disputed]: 0x9b59b6, // purple
});

/**
 * Return a human-readable label for a status numeric value.
 * @param {number} status
 * @returns {string}
 */
export function statusLabel(status) {
  switch (status) {
    case ESCROW_STATUS.Created:
      return "Created";
    case ESCROW_STATUS.Funded:
      return "Funded";
    case ESCROW_STATUS.Delivered:
      return "Delivered";
    case ESCROW_STATUS.Completed:
      return "Completed";
    case ESCROW_STATUS.Cancelled:
      return "Cancelled";
    case ESCROW_STATUS.Disputed:
      return "Disputed";
    default:
      return `Unknown (${status})`;
  }
}

/**
 * Read current escrow status (uint8).
 * @param {`0x${string}`} escrowAddress
 * @returns {Promise<number>}
 */
export async function getEscrowStatus(escrowAddress) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "status",
    args: [],
  });
}

/**
 * Read escrow amount (wei).
 * @param {`0x${string}`} escrowAddress
 * @returns {Promise<bigint>}
 */
export async function getEscrowAmount(escrowAddress) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "amount",
    args: [],
  });
}

/**
 * Read buyer and seller addresses.
 * @param {`0x${string}`} escrowAddress
 * @returns {Promise<{ buyer: `0x${string}`, seller: `0x${string}` }>}
 */
export async function getEscrowParties(escrowAddress) {
  const [buyer, seller] = await Promise.all([
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "buyer",
      args: [],
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "seller",
      args: [],
    }),
  ]);
  return { buyer, seller };
}

/**
 * Read a full snapshot of escrow state for convenience.
 * @param {`0x${string}`} escrowAddress
 * @returns {Promise<{ buyer: `0x${string}`, seller: `0x${string}`, amountWei: bigint, amountEth: string, status: number, statusText: string, color: number }>}
 */
export async function getEscrowState(escrowAddress) {
  const [buyer, seller, amountWei, status] = await Promise.all([
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "buyer",
      args: [],
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "seller",
      args: [],
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "amount",
      args: [],
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "status",
      args: [],
    }),
  ]);

  return {
    buyer,
    seller,
    amountWei,
    amountEth: formatEther(amountWei ?? 0n),
    status,
    statusText: statusLabel(Number(status)),
    color: ESCROW_STATUS_COLORS[Number(status)] ?? 0x95a5a6,
  };
}

/**
 * Watch for the Escrow Funded event and invoke the callback.
 *
 * Notes:
 * - The returned function unsubscribes the watcher.
 * - If emitOnStart is true and the escrow is already funded when subscribing,
 *   we will immediately call the handler with a synthetic event built from current state.
 *
 * @param {`0x${string}`} escrowAddress
 * @param {(data: { buyer: `0x${string}`, amountWei: bigint, amountEth: string, txHash?: `0x${string}` }) => (void|Promise<void>)} handler
 * @param {{ emitOnStart?: boolean }} [options]
 * @returns {() => void} unwatch
 */
export function watchEscrowFunded(escrowAddress, handler, options = {}) {
  const { emitOnStart = false } = options;

  let unsub = publicClient.watchContractEvent({
    address: escrowAddress,
    abi: ESCROW_ABI,
    eventName: "Funded",
    onLogs: async (logs) => {
      // 'Funded' is a simple event; only the latest log matters for front-end state
      for (const log of logs) {
        const buyer = log.args?.buyer;
        const amountWei = log.args?.amount ?? 0n;
        const amountEth = formatEther(amountWei);
        const txHash = log.transactionHash;
        await handler({ buyer, amountWei, amountEth, txHash });
      }
    },
    onError: (err) => {
      // You may want to add your own logger here
      console.error("Escrow watcher error (Funded):", err);
    },
    args: undefined, // no indexed filters besides buyer; leave undefined to get all Funded logs
  });

  // Optionally emit current state (if already funded)
  if (emitOnStart) {
    // Fire-and-forget async check
    (async () => {
      try {
        const [status, amountWei, { buyer }] = await Promise.all([
          getEscrowStatus(escrowAddress),
          getEscrowAmount(escrowAddress),
          getEscrowParties(escrowAddress),
        ]);
        if (Number(status) === ESCROW_STATUS.Funded) {
          await handler({
            buyer,
            amountWei,
            amountEth: formatEther(amountWei ?? 0n),
          });
        }
      } catch (e) {
        console.error("Escrow emitOnStart check failed:", e);
      }
    })();
  }

  return () => {
    try {
      if (typeof unsub === "function") unsub();
    } catch {}
    unsub = null;
  };
}

/**
 * Poll for a funded state (useful if you don't want a long-lived watcher).
 * Resolves when status becomes Funded or when timeout elapses.
 *
 * @param {`0x${string}`} escrowAddress
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ funded: true, amountWei: bigint, amountEth: string } | { funded: false }>}
 */
export async function waitForFunded(escrowAddress, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2 * 60 * 1000; // 2 minutes
  const intervalMs = options.intervalMs ?? 4000; // 4s

  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const [status, amountWei] = await Promise.all([
        getEscrowStatus(escrowAddress),
        getEscrowAmount(escrowAddress),
      ]);

      if (Number(status) === ESCROW_STATUS.Funded) {
        return { funded: true, amountWei, amountEth: formatEther(amountWei) };
      }
    } catch (e) {
      // swallow intermittent RPC errors and keep polling
      console.warn("waitForFunded poll error:", e?.message ?? e);
    }

    if (Date.now() - start >= timeoutMs) {
      return { funded: false };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
