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
 *     amountEth: "0.001",
 *   });
 */

import { createTrade } from "./createTrade.js";
import { deriveEscrowAddressFromTx } from "./deriveEscrowAddress.js";
import { getFlow, setFlow } from "./flowState.js";
import { initEscrowStatusAndWatcher } from "./escrowStatus.js";

/**
 * @typedef {Object} CreateAndAnnounceOptions
 * @property {import('discord.js').TextChannel | import('discord.js').ThreadChannel} channel
 * @property {string} uid - The user id whose flow we should read/update (flow must have role/counterparty).
 * @property {string} buyerAddress - The buyer's EOA address
 * @property {string} sellerAddress - The seller's EOA address
 * @property {string|number} [amountEth="0.001"] - Amount used only for display/consistency; factory call doesn't require it today.
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
  amountEth = "0.001",
  initOptions,
}) {
  if (!channel || typeof channel.send !== "function") {
    throw new Error("createAndAnnounceTrade: 'channel' must be a channel-like object with send()");
  }
  if (!uid) throw new Error("createAndAnnounceTrade: 'uid' is required");
  if (!buyerAddress || !sellerAddress) {
    throw new Error("createAndAnnounceTrade: 'buyerAddress' and 'sellerAddress' are required");
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

    // 4) Store escrow address in both sides' flow
    if (escrowAddress) {
      setFlow(uid, { escrowAddress });
      const flow2 = getFlow(uid);
      if (flow2?.counterpartyId) {
        setFlow(flow2.counterpartyId, { escrowAddress });
      }
    }

    // 5) Edit the progress message to success + details
    await creatingMsg.edit({
      content: `✅ Trade created! Tx: ${txHash}${escrowAddress ? ` | Escrow: ${escrowAddress}` : ""}`,
    });

    // 6) Initialize the status embed + watcher
    if (escrowAddress) {
      try {
        await initEscrowStatusAndWatcher({
          channel,
          uid,
          escrowAddress,
          options: {
            backfill: true,
            title: initOptions?.title ?? "Escrow Status",
            initialDescription:
              initOptions?.initialDescription ??
              "This will update automatically when the buyer funds the escrow.",
            updatedDescription:
              initOptions?.updatedDescription ?? "Escrow status has been updated.",
          },
        });
      } catch (e) {
        // Non-fatal: keep going even if init fails
        // eslint-disable-next-line no-console
        console.error("createAndAnnounceTrade: failed to init status embed/watcher:", e);
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
