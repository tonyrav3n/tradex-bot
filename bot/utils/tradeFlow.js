/**
 * Shared helper for creating a trade, announcing progress in the thread,
 * wiring flow state, and initializing the escrow status embed + watcher.
 *
 * This consolidates the duplicate logic that used to live in multiple places:
 * - Post "⏳ Creating trade..."
 * - Call factory to create an escrow (createTrade)
 * - Derive the escrow address robustly from the transaction (deriveEscrowAddressFromTx)
 * - Store escrow address into both parties' flows
 * - Edit the "creating" message to success/failure
 * - Initialize the status embed with a Funded watcher (with optional backfill)
 *
 * Usage:
 *   import { createAndAnnounceTrade } from "./tradeFlow.js";
 *
 *   await createAndAnnounceTrade({
 *     channel: interaction.channel,
 *     uid: interaction.user.id,
 *     buyerAddress: f.buyerAddress,
 *     sellerAddress: f.sellerAddress,
 *   });
 */

import { createTrade } from "./createTrade.js";
import { deriveEscrowAddressFromTx } from "./deriveEscrowAddress.js";
import { getFlow, setFlow } from "./flowRepo.js";
import { initEscrowStatusAndWatcher } from "./escrowStatus.js";
import { recordEscrowCreation, setStatusMessageId } from "./escrowRepo.js";
import { watchEscrowFunded } from "./escrow.js";

/**
 * @typedef {Object} CreateAndAnnounceOptions
 * @property {import('discord.js').TextChannel | import('discord.js').ThreadChannel} channel
 * @property {string} uid - The user id whose flow we should read/update (flow must have role/counterparty).
 * @property {string} buyerAddress - The buyer's EOA address
 * @property {string} sellerAddress - The seller's EOA address
 * @property {string|number} [amountEth] - Optional display-only amount; factory call doesn't require it.
 * @property {Object} [initOptions] - Options forwarded to initEscrowStatusAndWatcher
 * @property {boolean} [initOptions.backfill=true] - Whether to backfill funded state
 * @property {string} [initOptions.title="Escrow Status"] - Embed title
 * @property {string} [initOptions.initialDescription] - Description for initial post
 * @property {string} [initOptions.updatedDescription] - Description for updates
 */

/**
 * Create a trade, announce progress in the thread, set flow with escrow address,
 * and initialize the status embed and watcher.
 *
 * @param {CreateAndAnnounceOptions} params
 * @returns {Promise<{ txHash: string | null, escrowAddress: string | null, messageId: string | null }>}
 */
export async function createAndAnnounceTrade({
  channel,
  uid,
  buyerAddress,
  sellerAddress,
  amountEth,
  initOptions,
}) {
  if (!channel || typeof channel.send !== "function") {
    throw new Error(
      "createAndAnnounceTrade: 'channel' must be a channel-like object with send()",
    );
  }
  if (!uid) throw new Error("createAndAnnounceTrade: 'uid' is required");
  if (!buyerAddress || !sellerAddress) {
    throw new Error(
      "createAndAnnounceTrade: 'buyerAddress' and 'sellerAddress' are required",
    );
  }

  let creatingMsg = null;
  let txHash = null;
  let escrowAddress = null;

  // 1) Announce that we're starting
  creatingMsg = await channel.send({
    content: "⏳ Creating trade...",
  });

  try {
    // 2) Create via factory
    txHash = await createTrade(buyerAddress, sellerAddress, amountEth);

    // 3) Derive escrow address robustly from the tx
    escrowAddress = await deriveEscrowAddressFromTx(txHash);

    // 4) Store escrow address in both sides' flow and persist in DB
    if (escrowAddress) {
      await setFlow(uid, { escrowAddress });
      const flow2 = await getFlow(uid);
      if (flow2?.counterpartyId) {
        await setFlow(flow2.counterpartyId, { escrowAddress });
      }

      // Persist creation in DB with Discord context and parties
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
        await recordEscrowCreation({
          escrowAddress,
          factoryTxHash: txHash,
          channelId,
          threadId,
          statusMessageId: null,
          creatorUserId: uid,
          buyerDiscordId,
          sellerDiscordId,
          buyerAddress: full?.buyerAddress ?? null,
          sellerAddress: full?.sellerAddress ?? null,
        });
      } catch (e) {
        console.error("DB recordEscrowCreation failed:", e);
      }

      // Lightweight DB watcher for 'Funded' to persist amount/status
      try {
        watchEscrowFunded(
          escrowAddress,
          async () => {
            // DB persistence handled by escrow status watcher
          },
          { emitOnStart: true },
        );
      } catch (e) {
        console.error("Failed to start DB funded watcher:", e);
      }
    }

    // 5) Edit the progress message to success + details
    await creatingMsg.edit({
      content: `✅ Trade created!`,
    });

    // 6) Initialize the status embed + watcher
    if (escrowAddress) {
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

        const { messageId } = await initEscrowStatusAndWatcher({
          channel,
          uid,
          escrowAddress,
          options: optionsToUse,
        });
        if (messageId) {
          try {
            await setStatusMessageId(escrowAddress, messageId);
          } catch (e2) {
            console.error("DB setStatusMessageId failed:", e2);
          }
        }
      } catch (e) {
        // Non-fatal: keep going even if init fails
        console.error(
          "createAndAnnounceTrade: failed to init status embed/watcher:",
          e,
        );
      }
    }
  } catch (e) {
    // 7) Show failure on the same progress message
    try {
      await creatingMsg.edit({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    } catch {
      // If editing fails, fallback to posting a new message
      await channel.send({
        content: `❌ Failed to create trade: ${e.message}`,
      });
    }
    return { txHash, escrowAddress, messageId: creatingMsg?.id ?? null };
  }

  return { txHash, escrowAddress, messageId: creatingMsg?.id ?? null };
}

export default {
  createAndAnnounceTrade,
};
