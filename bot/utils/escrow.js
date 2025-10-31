import { publicClient, walletClient } from "./client.js";
import { formatEther } from "viem";
import { escrowEmbedColorForStatus } from "./theme.js";

/**
 * Minimal Escrow ABI for reading and event watching.
 * Matches contracts/TradeNestEscrow.sol
 */
export const ESCROW_ABI = [
  // Events
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

  // Views
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
    type: "function",
    stateMutability: "view",
    name: "status",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },

  // Functions (for reference and potential writes)
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

// Matches TradeStatus enum in TradeNestEscrow.sol
export const ESCROW_STATUS = Object.freeze({
  Created: 0,
  Funded: 1,
  Delivered: 2,
  Completed: 3,
  Cancelled: 4,
  Disputed: 5,
});

export function statusLabel(status) {
  switch (Number(status)) {
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

export async function getEscrowStatus(escrowAddress) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "status",
    args: [],
  });
}

export async function getEscrowAmount(escrowAddress) {
  return publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "amount",
    args: [],
  });
}

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

  const statusNum = Number(status);
  const amountEth = formatEther(amountWei ?? 0n);

  return {
    buyer,
    seller,
    amountWei,
    amountEth,
    status: statusNum,
    statusText: statusLabel(statusNum),
    color: escrowEmbedColorForStatus(statusNum),
  };
}

/**
 * Watch the Escrow 'Funded' event and call handler on logs.
 * Returns an unwatch function.
 */
export function watchEscrowFunded(escrowAddress, handler, options = {}) {
  const { emitOnStart = false } = options;

  const unwatch = publicClient.watchContractEvent({
    address: escrowAddress,
    abi: ESCROW_ABI,
    eventName: "Funded",
    onLogs: async (logs) => {
      for (const log of logs) {
        const buyer = log.args?.buyer;
        const amountWei = log.args?.amount ?? 0n;
        const amountEth = formatEther(amountWei);
        const txHash = log.transactionHash;
        await handler({ buyer, amountWei, amountEth, txHash });
      }
    },
    onError: (err) => {
      console.error("Escrow watcher error (Funded):", err);
    },
  });

  if (emitOnStart) {
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
        console.error("emitOnStart failed:", e);
      }
    })();
  }

  return () => {
    try {
      if (typeof unwatch === "function") unwatch();
    } catch (e) {
      console.error("Escrow unwatch cleanup failed:", e);
    }
  };
}

/**
 * Poll until the escrow becomes Funded or timeout.
 */
export async function waitForFunded(escrowAddress, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2 * 60 * 1000; // 2 minutes
  const intervalMs = options.intervalMs ?? 4000; // 4 seconds

  const start = Date.now();

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
      console.warn("waitForFunded poll error:", e?.message ?? e);
    }

    if (Date.now() - start >= timeoutMs) {
      return { funded: false };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function markEscrowDelivered(escrowAddress) {
  return walletClient.writeContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "markDelivered",
    args: [],
  });
}

export async function approveEscrowDelivery(escrowAddress) {
  return walletClient.writeContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "approveDelivery",
    args: [],
  });
}
