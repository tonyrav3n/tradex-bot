/**
 * amisTradeFlow.js
 *
 * Amis trade flow utility:
 * - Create a trade on the AmisEscrowManager (bot-only call)
 * - Persist creation context in DB (manager + tradeId)
 * - Initialize the status embed + watcher for the trade
 * - Start a lightweight Funded watcher to persist DB status/amount
 *
 * Usage:
 *   import { createAndAnnounceAmisTrade } from "./amisTradeFlow.js";
 *
 *   const { txHash, tradeId, messageId } = await createAndAnnounceAmisTrade({
 *     channel,            // Discord thread/channel
 *     uid,                // initiating user's id (flow owner)
 *     buyerAddress,       // EOA address
 *     sellerAddress,      // EOA address
 *     amountEth,          // optional (string/number); base amount in ETH
 *     initOptions: {      // optional embed options
 *       backfill: true,
 *       title: "Escrow Status",
 *       initialDescription: "...",
 *       updatedDescription: "...",
 *     },
 *   });
 */

import { parseEther } from "ethers";
import { AMIS_ADDRESS } from "./amisContract.js";
import {
  createTrade as amisCreateTrade,
  deriveTradeIdFromTx,
  watchFunded,
} from "./amis.js";
import { initAmisStatusAndWatcher } from "./amisStatus.js";
import { getFlow, setFlow } from "./flowRepo.js";
import {
  recordAmisTradeCreation,
  setStatusMessageIdByManagerTrade,
  setEscrowStatusByManagerTrade,
  ESCROW_STATUS,
} from "./escrowRepo.js";

/**
 * Create a trade, record it, and initialize the status embed + watcher.
 *
 * @param {Object} params
 * @param {import('discord.js').TextChannel | import('discord.js').ThreadChannel} params.channel
 * @param {string} params.uid
 * @param {string} params.buyerAddress
 * @param {string} params.sellerAddress
 * @param {string|number} [params.amountEth] - optional base escrow amount in ETH (for UI consistency)
 * @param {Object} [params.initOptions] - options forwarded to initAmisStatusAndWatcher
 * @returns {Promise<{ txHash: `0x${string}` | null, tradeId: string | null, messageId: string | null }>}
 */
export async function createAndAnnounceAmisTrade({
  channel,
  uid,
  buyerAddress,
  sellerAddress,
  amountEth,
  initOptions,
}) {
  if (!channel || typeof channel.send !== "function") {
    throw new Error(
      "createAndAnnounceAmisTrade: 'channel' must be a channel-like object with send()",
    );
  }
  if (!uid) throw new Error("createAndAnnounceAmisTrade: 'uid' is required");
  if (!buyerAddress || !sellerAddress) {
    throw new Error(
      "createAndAnnounceAmisTrade: 'buyerAddress' and 'sellerAddress' are required",
    );
  }

  let creatingMsg = null;
  let txHash = null;
  let tradeId = null;
  let messageId = null;

  // 1) Announce that we're starting
  creatingMsg = await channel.send({
    content: "⏳ Creating trade...",
  });

  try {
    // 2) Convert amountEth (if provided) to wei for on-chain base amount
    let amountWei = null;
    if (
      amountEth !== undefined &&
      amountEth !== null &&
      String(amountEth).trim() !== ""
    ) {
      try {
        amountWei = parseEther(String(amountEth));
      } catch (e) {
        // Non-fatal: proceed without amount hint; contract's createTrade requires amount
        // If amount is required by your UX, ensure amountEth is provided upstream.
        throw new Error(`Invalid amountEth: ${e?.message || e}`);
      }
    }
    if (amountWei == null) {
      throw new Error(
        "Base amount (amountEth) is required for Amis createTrade. Provide 'amountEth' as a string or number.",
      );
    }

    // 3) Create via manager (bot-only); returns tx hash and tries to decode tradeId
    const res = await amisCreateTrade(buyerAddress, sellerAddress, amountWei);
    txHash = res?.txHash ?? null;
    try {
      await creatingMsg.edit({
        content: `📤 Submitted createTrade transaction${txHash ? `: ${txHash}` : ""}`,
      });
    } catch (e) {
      console.warn(
        "amisTradeFlow: failed to edit progress message (submitted tx)",
        e?.message || e,
      );
    }
    tradeId = res?.tradeId != null ? String(res.tradeId) : null;
    if (tradeId) {
      try {
        await creatingMsg.edit({
          content: `🔎 Trade created. Trade ID: ${tradeId}${txHash ? `\nTx: ${txHash}` : ""}`,
        });
      } catch (e) {
        console.warn(
          "amisTradeFlow: failed to edit progress message (trade created)",
          e?.message || e,
        );
      }
    } else if (txHash) {
      try {
        await creatingMsg.edit({
          content: `🔎 Waiting for confirmation to resolve trade ID…\nTx: ${txHash}`,
        });
      } catch (e) {
        console.warn(
          "amisTradeFlow: failed to edit progress message (waiting for tradeId)",
          e?.message || e,
        );
      }
    }

    // Fallback: attempt deriving tradeId from the tx receipt if missing
    if (!tradeId && txHash) {
      try {
        const derived = await deriveTradeIdFromTx(txHash);
        if (derived && derived > 0n) {
          tradeId = String(derived);
        }
      } catch (e) {
        // Keep going; status embed/watchers depend on tradeId, but DB will still track by channel/thread
        // However, without tradeId we cannot proceed to status embed init. Bail out with an error.
        throw new Error(`Failed to derive tradeId from tx: ${e?.message || e}`);
      }
    }

    // 4) Store tradeId in both sides' flow
    if (tradeId) {
      await setFlow(uid, { tradeId });
      const flow2 = await getFlow(uid);
      if (flow2?.counterpartyId) {
        await setFlow(flow2.counterpartyId, { tradeId });
      }
    }

    // 5) Persist creation in DB with Discord context and parties
    const full = await getFlow(uid);
    const isThread =
      typeof channel?.isThread === "function"
        ? channel.isThread()
        : !!channel?.isThread;
    const threadId = isThread ? (channel.id ?? null) : null;
    const channelId = isThread
      ? (channel.parentId ?? null)
      : (channel.id ?? null);

    const buyerDiscordId =
      full?.buyerDiscordId ??
      (full?.role === "buyer" ? uid : full?.counterpartyId) ??
      null;
    const sellerDiscordId =
      full?.sellerDiscordId ??
      (full?.role === "seller" ? uid : full?.counterpartyId) ??
      null;

    try {
      await recordAmisTradeCreation({
        managerAddress: AMIS_ADDRESS,
        tradeId,
        factoryTxHash: txHash,
        channelId,
        threadId,
        statusMessageId: null,
        creatorUserId: uid,
        buyerDiscordId,
        sellerDiscordId,
        buyerAddress: full?.buyerAddress ?? buyerAddress ?? null,
        sellerAddress: full?.sellerAddress ?? sellerAddress ?? null,
      });
    } catch (e) {
      // non-fatal
      console.error("DB recordAmisTradeCreation failed:", e);
    }

    // 6) Lightweight DB watcher for 'Funded' to persist amount/status
    try {
      if (tradeId) {
        watchFunded(
          tradeId,
          async (evt) => {
            try {
              await setEscrowStatusByManagerTrade(AMIS_ADDRESS, tradeId, {
                status: ESCROW_STATUS.Funded,
                amountWei: evt?.amountWei ?? null,
              });
            } catch (e2) {
              console.error("DB persist funded failed:", e2);
            }
          },
          { emitOnStart: true },
        );
      }
    } catch (e) {
      console.error("Failed to start DB funded watcher:", e);
    }

    // 7) Edit the progress message to success
    await creatingMsg.edit({
      content: `✅ Trade created! Trade ID: ${tradeId}`,
    });

    // 8) Initialize the status embed + watcher
    if (tradeId) {
      try {
        // Pass explicit USD price to the status embed options
        let optionsToUse = { ...(initOptions ?? {}) };
        try {
          const flowForPrice = await getFlow(uid);
          const usdPrice = flowForPrice?.priceUsd;
          if (usdPrice != null) {
            optionsToUse.priceUsd = usdPrice;
          }
        } catch (eOpt) {
          console.error("Failed to derive USD price for status embed:", eOpt);
        }

        const { messageId: statusMsgId } = await initAmisStatusAndWatcher({
          channel,
          uid,
          tradeId,
          options: optionsToUse,
        });
        messageId = statusMsgId ?? null;

        if (messageId) {
          try {
            await setStatusMessageIdByManagerTrade(
              AMIS_ADDRESS,
              tradeId,
              messageId,
            );
          } catch (e2) {
            console.error("DB setStatusMessageIdByManagerTrade failed:", e2);
          }
        }
      } catch (e) {
        console.error(
          "createAndAnnounceAmisTrade: failed to init status embed/watcher:",
          e,
        );
      }
    }
  } catch (e) {
    // Show failure on the same progress message
    try {
      await creatingMsg.edit({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    } catch {
      await channel.send({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    }
    return { txHash, tradeId, messageId: creatingMsg?.id ?? null };
  }

  return { txHash, tradeId, messageId: messageId ?? creatingMsg?.id ?? null };
}

export default {
  createAndAnnounceAmisTrade,
};
