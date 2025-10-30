/**
 * Utilities for notifying a specific counterparty in a trade thread.
 *
 * Posts a normal message in the thread mentioning exactly one user, using
 * allowedMentions to avoid noisy/global pings.
 *
 * Usage:
 *   import { notifyCounterparty } from "./notify.js";
 *
 *   await notifyCounterparty({
 *     channel: interaction.channel,    // TextChannel or ThreadChannel
 *     targetUserId: sellerId,          // the user to notify
 *     message: "Buyer has funded. Please deliver and click the 'Mark Delivered' button.",
 *   });
 */

/**
 * Build a safe, targeted mention content string.
 * @param {string|number} targetUserId
 * @param {string} message
 * @returns {string}
 */
function buildMentionContent(targetUserId, message) {
  const id = String(targetUserId).trim();
  const msg = String(message ?? "").trim();
  return `<@${id}>${msg ? ` ${msg}` : ""}`;
}

/**
 * Notify a specific user in the trade thread by posting a message that mentions them.
 *
 * Notes:
 * - This uses allowedMentions.users to only ping the specific user (no @everyone/@here).
 * - Works in both TextChannel and ThreadChannel.
 * - Returns the sent message or null if validation fails.
 *
 * @param {Object} params
 * @param {import('discord.js').TextChannel | import('discord.js').ThreadChannel} params.channel
 * @param {string|number} params.targetUserId - The Discord user id to notify.
 * @param {string} params.message - The human-friendly message to send after the mention.
 * @returns {Promise<import('discord.js').Message | null>}
 */
export async function notifyCounterparty({ channel, targetUserId, message }) {
  if (!channel || typeof channel.send !== "function") return null;
  if (
    targetUserId === null ||
    targetUserId === undefined ||
    targetUserId === ""
  )
    return null;

  const content = buildMentionContent(targetUserId, message);
  try {
    const sent = await channel.send({
      content,
      allowedMentions: {
        users: [String(targetUserId)],
        parse: [], // do not expand @everyone/@here or roles
      },
    });
    return sent ?? null;
  } catch (e) {
    // Log and swallow: callers generally don't want a thrown error to break the flow
    // when notifications are best-effort.
    console.error("notifyCounterparty: failed to send mention:", e);
    return null;
  }
}
