/**
 * Helper to initialize the escrow status embed and start a watcher
 * that updates the embed when the escrow is funded.
 *
 * Features:
 * - Creates a single status embed (once) and stores its message id in the flow for both parties
 * - Starts a single "Funded" watcher (once) and stores a flag in the flow for both parties
 * - Uses backfill (emitOnStart) so if funding already occurred, the embed updates immediately
 * - Resilient to transient Discord API errors with descriptive logging
 */

import { getEscrowState, watchEscrowFunded, ESCROW_STATUS } from "./escrow.js";
import {
  buildEscrowStatusEmbed,
  buildDeliveryActionsRow,
} from "./components.js";
import { getFlow, setFlow } from "./flowState.js";

/**
 * Initialize status embed and start a funded watcher for an escrow.
 *
 * @param {Object} params
 * @param {import('discord.js').TextChannel | import('discord.js').ThreadChannel} params.channel
 *   The channel/thread where the embed should be posted/updated.
 * @param {string} params.uid
 *   The user id whose flow we should read/update (flow must have role/counterparty).
 * @param {string} params.escrowAddress
 *   The escrow contract address.
 * @param {Object} [params.options]
 * @param {boolean} [params.options.backfill=true]
 *   If true, the watcher will emit on start (updates the embed if escrow is already funded).
 * @param {string} [params.options.title="Escrow Status"]
 *   Title to display on the embed.
 * @param {string} [params.options.initialDescription]
 *   Description to display when first posting the embed.
 * @param {string} [params.options.updatedDescription]
 *   Description to display when the status is updated.
 * @param {string} [params.options.overrideBuyerId]
 *   Optional explicit buyer Discord user id to display in the embed.
 * @param {string} [params.options.overrideSellerId]
 *   Optional explicit seller Discord user id to display in the embed.
 *
 * @returns {Promise<{ messageId: string | null, unwatch: (() => void) | null }>}
 *   Returns the message id of the status embed (if created/present) and an unwatch function.
 */
export async function initEscrowStatusAndWatcher({
  channel,
  uid,
  escrowAddress,
  options = {},
}) {
  if (!channel || typeof channel.send !== "function") {
    throw new Error(
      "initEscrowStatusAndWatcher: 'channel' is required and must support send()",
    );
  }
  if (!uid) throw new Error("initEscrowStatusAndWatcher: 'uid' is required");
  if (!escrowAddress)
    throw new Error("initEscrowStatusAndWatcher: 'escrowAddress' is required");

  const {
    backfill = true,
    title = "Escrow Status",
    initialDescription = "This will update automatically when the buyer funds the escrow.",
    updatedDescription = "Escrow status has been updated.",
    overrideBuyerId,
    overrideSellerId,
  } = options;

  let messageId = null;
  let unwatch = null;

  // Compute buyer/seller Discord IDs from flow, unless explicitly overridden.
  const flow = getFlow(uid) || {};
  const buyerId =
    overrideBuyerId ??
    (flow.role === "buyer" ? uid : flow.counterpartyId) ??
    null;
  const sellerId =
    overrideSellerId ??
    (flow.role === "seller" ? uid : flow.counterpartyId) ??
    null;

  // 1) Create the status embed if we haven't already.
  try {
    const haveMessageId = Boolean(flow.escrowStatusMessageId);
    if (!haveMessageId) {
      const state = await safeGetEscrowState(escrowAddress);
      const statusEmbed = buildEscrowStatusEmbed({
        escrowAddress,
        buyerId,
        sellerId,
        statusText: state?.statusText ?? "Created",
        amountEth: state?.amountEth ?? "0",
        color: state?.color ?? 0x95a5a6,
        title,
        description: initialDescription,
      });

      const components =
        state &&
        (state.status === ESCROW_STATUS.Funded || state.statusText === "Funded")
          ? [buildDeliveryActionsRow()]
          : [];
      const statusMsg = await channel.send({
        embeds: [statusEmbed],
        components,
      });
      messageId = statusMsg?.id ?? null;

      if (messageId) {
        setFlow(uid, { escrowStatusMessageId: messageId });
        if (flow?.counterpartyId) {
          setFlow(flow.counterpartyId, { escrowStatusMessageId: messageId });
        }
      }
    } else {
      messageId = flow.escrowStatusMessageId;
    }
  } catch (e) {
    console.error(
      "initEscrowStatusAndWatcher: failed to send initial status embed:",
      e,
    );
  }

  // 2) Start a single watcher that updates the embed when Funded is observed (with optional backfill).
  try {
    const alreadyStarted = Boolean(flow.escrowWatcherStarted);
    if (!alreadyStarted) {
      // Mark as started for both parties to avoid duplicate watchers
      setFlow(uid, { escrowWatcherStarted: true });
      const latest = getFlow(uid);
      if (latest?.counterpartyId) {
        setFlow(latest.counterpartyId, { escrowWatcherStarted: true });
      }

      unwatch = watchEscrowFunded(
        escrowAddress,
        async () => {
          try {
            // Fetch latest state after funding and update the embed
            const updated = await safeGetEscrowState(escrowAddress);

            const embed2 = buildEscrowStatusEmbed({
              escrowAddress,
              buyerId,
              sellerId,
              statusText: updated?.statusText ?? "Funded",
              amountEth: updated?.amountEth ?? "0",
              color: updated?.color ?? 0x2ecc71, // default to "Funded" green if missing
              title,
              description: updatedDescription,
            });

            const currentMsgId =
              getFlow(uid)?.escrowStatusMessageId ?? messageId;
            if (currentMsgId) {
              try {
                const msg = await channel.messages.fetch(currentMsgId);
                await msg.edit({
                  embeds: [embed2],
                  components: [buildDeliveryActionsRow()],
                });
              } catch (e) {
                console.error(
                  "initEscrowStatusAndWatcher: failed to edit status embed:",
                  e,
                );
              }
            }
          } catch (e) {
            console.error(
              "initEscrowStatusAndWatcher: failed to update on Funded:",
              e,
            );
          }
        },
        { emitOnStart: !!backfill },
      );
    }
  } catch (e) {
    console.error("initEscrowStatusAndWatcher: failed to start watcher:", e);
  }

  return { messageId, unwatch };
}

/**
 * Small wrapper to read escrow state safely and log errors without throwing.
 * @param {string} escrowAddress
 * @returns {Promise<import('./escrow.js').getEscrowState | null>}
 */
async function safeGetEscrowState(escrowAddress) {
  try {
    return await getEscrowState(escrowAddress);
  } catch (e) {
    console.warn("safeGetEscrowState: failed to read state:", e?.message ?? e);
    return null;
  }
}
