/**
 * Thread helpers to ensure a Discord thread is writable before posting.
 *
 * Why this exists:
 * - Threads can be auto-archived and become read-only.
 * - Attempting to send/edit while archived throws.
 * - These helpers unarchive first (and optionally extend auto-archive duration),
 *   then perform the requested operation.
 *
 * Usage examples:
 *   import { ensureThreadWritable, safeThreadSend, safeThreadEditMessage } from "./threads.js";
 *
 *   // Before sending
 *   await ensureThreadWritable(thread, { extendDurationTo: 10080, reason: "Continue trade flow" });
 *   await thread.send({ content: "Posting after unarchive" });
 *
 *   // One-liner helpers:
 *   await safeThreadSend(thread, { content: "Hello again" });
 *   await safeThreadEditMessage(thread, messageId, { content: "Updated content" });
 *
 * Notes:
 * - These functions expect a ThreadChannel (discord.js v14). If you pass a non-thread channel,
 *   helpers will no-op with { ok: false, reason: "not_thread" }.
 * - The bot must have permissions to manage/unarchive threads (Manage Threads),
 *   and to send messages in threads.
 * - Valid auto-archive durations: 60, 1440, 4320, 10080 (minutes). We default to 10080.
 */

/**
 * Best-effort type guard for ThreadChannel-like objects.
 * Avoid direct imports/types to keep this module lightweight.
 * @param {any} ch
 * @returns {boolean}
 */
function isThreadChannel(ch) {
  try {
    return !!ch && typeof ch.isThread === "function" && ch.isThread();
  } catch {
    return false;
  }
}

/**
 * Ensure a thread is writable:
 * - Unarchives if archived
 * - Optionally bumps auto-archive duration (default 7 days = 10080 minutes)
 *
 * @param {import('discord.js').ThreadChannel|any} thread
 * @param {{
 *   reason?: string,
 *   extendDurationTo?: 60 | 1440 | 4320 | 10080 | null,
 *   onlyIfArchived?: boolean
 * }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function ensureThreadWritable(thread, options = {}) {
  if (!isThreadChannel(thread)) {
    return { ok: false, reason: "not_thread" };
  }

  const {
    reason = "Unarchive to continue",
    extendDurationTo = 10080, // 7 days by default
    onlyIfArchived = false,
  } = options;

  try {
    // Unarchive if needed
    if (thread.archived) {
      await thread.setArchived(false, reason);
    } else if (onlyIfArchived) {
      // Caller only wanted to do something when archived; if it's not archived, bail early
      return { ok: true };
    }

    // Optionally extend auto-archive duration to reduce future auto-archives
    if (
      extendDurationTo &&
      typeof thread.autoArchiveDuration === "number" &&
      // Only increase if the new duration is longer
      thread.autoArchiveDuration < extendDurationTo
    ) {
      try {
        await thread.setAutoArchiveDuration(extendDurationTo, reason);
      } catch (e) {
        // Non-fatal: lack of permission or invalid duration (provider restrictions)
        // eslint-disable-next-line no-console
        console.warn(
          "Failed to extend thread auto-archive duration:",
          e?.message ?? e,
        );
      }
    }

    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("ensureThreadWritable failed:", err);
    return { ok: false, reason: "unarchive_failed" };
  }
}

/**
 * Safely send a message to a thread:
 * - Ensures thread is writable first (unarchive + extend duration)
 * - Sends the message
 *
 * @param {import('discord.js').ThreadChannel|any} thread
 * @param {import('discord.js').BaseMessageOptions} options
 * @param {{ reason?: string, extendDurationTo?: 60|1440|4320|10080 }} [ensureOptions]
 * @returns {Promise<import('discord.js').Message<boolean>>}
 */
export async function safeThreadSend(
  thread,
  options,
  ensureOptions = { extendDurationTo: 10080 },
) {
  const ensured = await ensureThreadWritable(thread, ensureOptions);
  if (!ensured.ok) {
    throw new Error(
      `Thread not writable (reason=${ensured.reason ?? "unknown"})`,
    );
  }
  return thread.send(options);
}

/**
 * Safely edit a message inside a thread:
 * - Ensures thread is writable first (unarchive + extend duration)
 * - Fetches and edits the message by id (or edits the provided Message object)
 *
 * @param {import('discord.js').ThreadChannel|any} thread
 * @param {string|import('discord.js').Message<boolean>} messageOrId
 * @param {import('discord.js').MessageEditOptions & import('discord.js').MessagePayload} options
 * @param {{ reason?: string, extendDurationTo?: 60|1440|4320|10080 }} [ensureOptions]
 * @returns {Promise<import('discord.js').Message<boolean>>}
 */
export async function safeThreadEditMessage(
  thread,
  messageOrId,
  options,
  ensureOptions = { extendDurationTo: 10080 },
) {
  const ensured = await ensureThreadWritable(thread, ensureOptions);
  if (!ensured.ok) {
    throw new Error(
      `Thread not writable (reason=${ensured.reason ?? "unknown"})`,
    );
  }

  const msg =
    typeof messageOrId === "string"
      ? await thread.messages.fetch(messageOrId)
      : messageOrId;

  return msg.edit(options);
}

/**
 * Safely update components or embeds of a status message by id:
 * - Convenience wrapper for common edits in this app (escrow status updates)
 *
 * @param {import('discord.js').ThreadChannel|any} thread
 * @param {string} messageId
 * @param {{ embeds?: any[], components?: any[] }} patch
 * @param {{ reason?: string, extendDurationTo?: 60|1440|4320|10080 }} [ensureOptions]
 * @returns {Promise<import('discord.js').Message<boolean>>}
 */
export async function safeThreadPatchMessage(
  thread,
  messageId,
  { embeds, components },
  ensureOptions = { extendDurationTo: 10080 },
) {
  return safeThreadEditMessage(
    thread,
    messageId,
    {
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
    },
    ensureOptions,
  );
}

export default {
  ensureThreadWritable,
  safeThreadSend,
  safeThreadEditMessage,
  safeThreadPatchMessage,
};
