/**
 * Amis-specific status embed and watcher helper (tradeId-based).
 *
 * Responsibilities:
 * - Initialize a single status embed for a given tradeId (posted once per thread)
 * - Start a single "Funded" watcher for that tradeId to update the embed
 * - Store the status message id and watcher-started flag in both parties' flows
 * - Optionally backfill state on start if the trade is already funded
 *
 * Usage:
 *   import { initAmisStatusAndWatcher } from "./amisStatus.js";
 *
 *   await initAmisStatusAndWatcher({
 *     channel,          // Discord thread/channel
 *     uid,              // initiating user's id (used to locate flow + counterparty)
 *     tradeId,          // on-chain trade id (uint256)
 *     options: {
 *       backfill: true,
 *       title: "Escrow Status",
 *       initialDescription: "...",
 *       updatedDescription: "...",
 *       overrideBuyerId,
 *       overrideSellerId,
 *       priceUsd,       // display helper (USD base price)
 *     }
 *   });
 */

import { AMIS_ADDRESS } from "./amisContract.js";
import { getTradeState, watchFunded, AMIS_STATUS } from "./amis.js";
import { buildEscrowStatusEmbed, buildActionsForStatus } from "./components.js";
import { getFlow, setFlow } from "./flowRepo.js";

/**
 * Initialize status embed and start a funded watcher for an Amis trade (by tradeId).
 *
 * @param {Object} params
 * @param {import('discord.js').TextChannel | import('discord.js').ThreadChannel} params.channel
 * @param {string} params.uid
 * @param {bigint|number|string} params.tradeId
 * @param {Object} [params.options]
 * @param {boolean} [params.options.backfill=true]
 * @param {string} [params.options.title="📊 Escrow Status"]
 * @param {string} [params.options.initialDescription]
 * @param {string} [params.options.updatedDescription]
 * @param {string} [params.options.overrideBuyerId]
 * @param {string} [params.options.overrideSellerId]
 * @param {string|number} [params.options.priceUsd]
 *
 * @returns {Promise<{ messageId: string | null, unwatch: (() => void) | null }>}
 */
export async function initAmisStatusAndWatcher({
  channel,
  uid,
  tradeId,
  options = {},
}) {
  if (!channel || typeof channel.send !== "function") {
    throw new Error(
      "initAmisStatusAndWatcher: 'channel' is required and must support send()",
    );
  }
  if (!uid) throw new Error("initAmisStatusAndWatcher: 'uid' is required");
  if (
    tradeId === null ||
    tradeId === undefined ||
    (typeof tradeId === "number" && !Number.isFinite(tradeId))
  ) {
    throw new Error("initAmisStatusAndWatcher: 'tradeId' is required");
  }

  const {
    backfill = true,
    title = "📊 Escrow Status",
    initialDescription = "This will update automatically when the buyer funds the escrow.",
    updatedDescription = "Buyer has funded",
    overrideBuyerId,
    overrideSellerId,
    priceUsd,
  } = options;

  let messageId = null;
  let unwatch = null;

  // Resolve buyer/seller Discord IDs from flow unless explicitly overridden
  const flow = (await getFlow(uid)) || {};
  const buyerId =
    overrideBuyerId ??
    (flow.role === "buyer" ? uid : flow.counterpartyId) ??
    null;
  const sellerId =
    overrideSellerId ??
    (flow.role === "seller" ? uid : flow.counterpartyId) ??
    null;

  // Create the status embed if not present (or if the stored message is gone)
  try {
    let storedMessageId = flow.escrowStatusMessageId ?? null;
    let existingMessage = null;

    if (
      storedMessageId &&
      channel?.messages &&
      typeof channel.messages.fetch === "function"
    ) {
      try {
        existingMessage = await channel.messages.fetch(storedMessageId);
        messageId = existingMessage?.id ?? null;
      } catch (fetchErr) {
        console.warn(
          "initAmisStatusAndWatcher: stored status message missing, recreating",
          fetchErr?.message ?? fetchErr,
        );
        storedMessageId = null;
        messageId = null;

        try {
          await setFlow(uid, { escrowStatusMessageId: null });
          if (flow?.counterpartyId) {
            await setFlow(flow.counterpartyId, { escrowStatusMessageId: null });
          }
        } catch (persistErr) {
          console.error(
            "initAmisStatusAndWatcher: failed to clear stale message id:",
            persistErr,
          );
        }
      }
    } else if (storedMessageId) {
      // messages.fetch is unavailable for this channel type
      storedMessageId = null;
      messageId = null;
    }

    const state = await safeGetTradeState(tradeId);

    const statusEmbed = buildEscrowStatusEmbed({
      escrowAddress: AMIS_ADDRESS, // show manager address for explorer link
      buyerId,
      sellerId,
      statusText: state?.statusText ?? "Created",
      amountEth: state?.amountEth ?? "0",
      title,
      description: initialDescription,
      priceUsd,
    });

    const components = buildActionsForStatus(
      state?.status ?? state?.statusText,
    );

    if (existingMessage && messageId) {
      try {
        await existingMessage.edit({
          embeds: [statusEmbed],
          components,
        });
      } catch (editErr) {
        console.error(
          "initAmisStatusAndWatcher: failed to edit existing status embed:",
          editErr,
        );
        existingMessage = null;
        messageId = null;
      }
    }

    if (!existingMessage) {
      const statusMsg = await channel.send({
        embeds: [statusEmbed],
        components,
      });

      messageId = statusMsg?.id ?? null;

      if (messageId) {
        try {
          await setFlow(uid, { escrowStatusMessageId: messageId });
          if (flow?.counterpartyId) {
            await setFlow(flow.counterpartyId, {
              escrowStatusMessageId: messageId,
            });
          }
        } catch (persistErr) {
          console.error(
            "initAmisStatusAndWatcher: failed to persist status message id:",
            persistErr,
          );
        }
      }
    }
  } catch (e) {
    console.error(
      "initAmisStatusAndWatcher: failed to send initial status embed:",
      e,
    );
  }

  // Start a watcher for the 'Funded' event (with optional backfill)
  try {
    const alreadyStarted = Boolean(flow.escrowWatcherStarted);
    if (!alreadyStarted) {
      // Mark started for both parties
      await setFlow(uid, { escrowWatcherStarted: true });
      const latest = await getFlow(uid);
      if (latest?.counterpartyId) {
        await setFlow(latest.counterpartyId, { escrowWatcherStarted: true });
      }

      unwatch = watchFunded(
        tradeId,
        async () => {
          try {
            const updated = await safeGetTradeState(tradeId);

            // Update the embed to reflect the funded state
            const embed2 = buildEscrowStatusEmbed({
              escrowAddress: AMIS_ADDRESS,
              buyerId,
              sellerId,
              statusText: updated?.statusText ?? "Funded",
              amountEth: updated?.amountEth ?? "0",
              title,
              description: updatedDescription,
              priceUsd,
            });

            // Find current message id from flow (to handle races) and edit the message
            const current = await getFlow(uid);
            const currentMsgId = current?.escrowStatusMessageId ?? messageId;
            if (currentMsgId) {
              try {
                const msg = await channel.messages.fetch(currentMsgId);
                await msg.edit({
                  embeds: [embed2],
                  components: buildActionsForStatus(
                    updated?.status ?? updated?.statusText,
                  ),
                });
              } catch (e) {
                console.error(
                  "initAmisStatusAndWatcher: failed to edit status embed:",
                  e,
                );
              }
            }

            // Notify seller about the next action (deliver)
            const updatedLabel = String(
              updated?.statusText ?? "",
            ).toLowerCase();
            if (updatedLabel === "funded" && sellerId) {
              try {
                const amountEthNum = parseFloat(
                  String(updated?.amountEth ?? "0"),
                );
                const payoutEth = Number.isFinite(amountEthNum)
                  ? amountEthNum * 0.975
                  : null;

                const baseUsdNum =
                  priceUsd != null
                    ? parseFloat(String(priceUsd).replace(/,/g, ""))
                    : null;
                const payoutUsd =
                  baseUsdNum != null && Number.isFinite(baseUsdNum)
                    ? baseUsdNum * 0.975
                    : null;

                const fmt = (n, d = 6) =>
                  n == null || !Number.isFinite(n)
                    ? null
                    : Number(n)
                        .toFixed(d)
                        .replace(/(\.\d*?[1-9])0+$/u, "$1")
                        .replace(/\.0+$/u, ".0")
                        .replace(/\.$/u, "");

                const payoutEthStr = fmt(payoutEth, 6);
                const payoutUsdStr =
                  payoutUsd == null
                    ? null
                    : Number(payoutUsd)
                        .toFixed(2)
                        .replace(/(\.\d*?[1-9])0+$/u, "$1")
                        .replace(/\.0+$/u, ".0")
                        .replace(/\.$/u, "");

                const payoutLine =
                  payoutEthStr && payoutUsdStr
                    ? ` Seller will receive ~ ${payoutEthStr} ETH (~$${payoutUsdStr}) after 2.5% fee.`
                    : payoutEthStr
                      ? ` Seller will receive ~ ${payoutEthStr} ETH after 2.5% fee.`
                      : "";

                await channel.send({
                  content: `<@${sellerId}> Buyer has funded.${payoutLine} Please deliver and click the 'Mark Delivered' button.`,
                  allowedMentions: { users: [String(sellerId)], parse: [] },
                });
              } catch (e3) {
                console.error("notify seller failed:", e3);
              }
            }
          } catch (e) {
            console.error("initAmisStatusAndWatcher: funded update failed:", e);
          }
        },
        { emitOnStart: !!backfill },
      );
    }
  } catch (e) {
    console.error("initAmisStatusAndWatcher: failed to start watcher:", e);
  }

  return { messageId, unwatch };
}

/**
 * Read trade state safely and log (don't throw) on errors.
 * @param {bigint|number|string} tradeId
 * @returns {Promise<ReturnType<typeof getTradeState> | null>}
 */
async function safeGetTradeState(tradeId) {
  try {
    return await getTradeState(tradeId);
  } catch (e) {
    console.warn("safeGetTradeState: failed to read state:", e?.message ?? e);
    return null;
  }
}

export default {
  initAmisStatusAndWatcher,
  AMIS_STATUS,
};
