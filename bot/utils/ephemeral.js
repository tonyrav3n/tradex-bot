/**
 * Ephemeral message utilities.
 *
 * Goal: Let you update an existing ephemeral message later in the flow,
 * even if you no longer have the original Interaction instance handy.
 *
 * How it works:
 * - Discord exposes the "original response" to an interaction via a webhook
 *   at: PATCH /webhooks/{application_id}/{interaction_token}/messages/@original
 * - In discord.js v14 you can use WebhookClient with the application id and the
 *   interaction token, then call `editMessage('@original', ...)`.
 *
 * Important notes:
 * - You can only edit the original reply that was created for that interaction
 *   (e.g., via deferReply({ flags: Ephemeral }) + editReply()).
 * - You cannot convert a non-ephemeral message to ephemeral (or vice versa) when editing.
 * - The token expires shortly after creation (usually 15 minutes). Plan to update quickly.
 */

import { WebhookClient } from "discord.js";

/**
 * Create a WebhookClient that targets the original interaction response.
 * @param {string} applicationId - The bot application's ID (client.application.id).
 * @param {string} interactionToken - The interaction token to access the original response.
 * @returns {WebhookClient}
 */
function buildInteractionWebhook(applicationId, interactionToken) {
  return new WebhookClient({ id: applicationId, token: interactionToken });
}

/**
 * Update the original ephemeral interaction reply using only the application id and interaction token.
 *
 * Typical usage:
 *   await updateEphemeralOriginal(
 *     client.application.id,
 *     interaction.token,
 *     {
 *       content: "Updated content",
 *       embeds: [embed],
 *       components: [row],
 *     }
 *   );
 *
 * @param {string} applicationId - The bot application's ID (client.application.id).
 * @param {string} interactionToken - The original interaction token.
 * @param {import('discord.js').WebhookEditMessageOptions} options - Message edit options.
 *   Common fields: content, embeds, components, attachments, allowedMentions
 *   Note: 'flags' is ignored when editing; ephemeral status is set by the original reply.
 *
 * @returns {Promise<import('discord.js').Message<boolean>>} The updated message.
 *
 * @throws If the token is invalid/expired or the original message no longer exists,
 *         discord.js will throw a DiscordAPIError (e.g., Unknown Webhook/Message).
 */
export async function updateEphemeralOriginal(applicationId, interactionToken, options) {
  const webhook = buildInteractionWebhook(applicationId, interactionToken);

  // Ensure we don't accidentally include unsupported fields (like flags) when editing.
  // Clone and sanitize options.
  const { flags, ...safeOptions } = options ?? {};

  return webhook.editMessage("@original", safeOptions);
}

/**
 * Convenience helper to update only content while clearing components/embeds if desired.
 *
 * @param {string} applicationId
 * @param {string} interactionToken
 * @param {string} content - New message content
 * @param {Object} [opts]
 * @param {boolean} [opts.clearComponents=false] - If true, removes all components.
 * @param {boolean} [opts.clearEmbeds=false] - If true, removes all embeds.
 * @returns {Promise<import('discord.js').Message<boolean>>}
 */
export async function updateEphemeralContent(
  applicationId,
  interactionToken,
  content,
  { clearComponents = false, clearEmbeds = false } = {}
) {
  const options = {
    content,
    components: clearComponents ? [] : undefined,
    embeds: clearEmbeds ? [] : undefined,
  };

  return updateEphemeralOriginal(applicationId, interactionToken, options);
}
