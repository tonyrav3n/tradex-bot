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

import { getEscrowState, watchEscrowFunded } from "./escrow.js";
import { buildEscrowStatusEmbed, buildActionsForStatus } from "./components.js";
import { getFlow, setFlow } from "./flowRepo.js";
import { setStatusMessageId, markFunded } from "./escrowRepo.js";

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
    title,
    initialDescription = "This will update automatically when the buyer funds the escrow.",
    updatedDescription = "Buyer has funded",
    overrideBuyerId,
    overrideSellerId,
    priceUsd,
  } = options;

  let messageId = null;
  let unwatch = null;

  // Compute buyer/seller Discord IDs from flow, unless explicitly overridden.
  const flow = (await getFlow(uid)) || {};
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
        statusText: state?.statusText,
        amountEth: state?.amountEth,
        color: state?.color,
        title,
        description: initialDescription,
        priceUsd,
      });

      const components = buildActionsForStatus(
        state?.status ?? state?.statusText,
      );
      const statusMsg = await channel.send({
        embeds: [statusEmbed],
        components,
      });
      messageId = statusMsg?.id ?? null;

      if (messageId) {
        await setFlow(uid, { escrowStatusMessageId: messageId });
        if (flow?.counterpartyId) {
          await setFlow(flow.counterpartyId, {
            escrowStatusMessageId: messageId,
          });
        }
        try {
          await setStatusMessageId(escrowAddress, messageId);
        } catch (e) {
          console.error("setStatusMessageId failed:", e);
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
      await setFlow(uid, { escrowWatcherStarted: true });
      const latest = await getFlow(uid);
      if (latest?.counterpartyId) {
        await setFlow(latest.counterpartyId, { escrowWatcherStarted: true });
      }

      unwatch = watchEscrowFunded(
        escrowAddress,
        async () => {
          try {
            // Fetch latest state after funding and update the embed
            const updated = await safeGetEscrowState(escrowAddress);
            try {
              await markFunded(escrowAddress, {
                amountWei: updated?.amountWei,
              });
            } catch (e2) {
              console.error("DB markFunded failed:", e2);
            }

            const embed2 = buildEscrowStatusEmbed({
              escrowAddress,
              buyerId,
              sellerId,
              statusText: updated?.statusText,
              amountEth: updated?.amountEth,
              color: updated?.color ?? 0x2ecc71, // default to "Funded" green if missing
              title,
              description: updatedDescription,
              priceUsd,
            });

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

                // Notify the counterparty in the thread about the next action
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
                    const payoutEthStr =
                      payoutEth != null
                        ? Number(payoutEth)
                            .toFixed(6)
                            .replace(/(\.\d*?[1-9])0+$/u, "$1")
                            .replace(/\.0+$/u, ".0")
                            .replace(/\.$/u, "")
                        : null;

                    const baseUsdNum =
                      priceUsd != null
                        ? parseFloat(String(priceUsd).replace(/,/g, ""))
                        : null;
                    const payoutUsdStr =
                      baseUsdNum != null && Number.isFinite(baseUsdNum)
                        ? (baseUsdNum * 0.975)
                            .toFixed(2)
                            .replace(/(\.\d*?[1-9])0+$/u, "$1")
                            .replace(/\.0+$/u, ".0")
                            .replace(/\.$/u, "")
                        : null;

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
                } else if (updatedLabel === "delivered" && buyerId) {
                  try {
                    await channel.send({
                      content: `<@${buyerId}> Seller marked delivered. Please approve & release.`,
                      allowedMentions: { users: [String(buyerId)], parse: [] },
                    });
                  } catch (e4) {
                    console.error("notify buyer failed:", e4);
                  }
                }
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
