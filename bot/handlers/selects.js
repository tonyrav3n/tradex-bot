/**
 * Select menu interaction handlers extracted from the monolithic interactionCreate.js.
 *
 * Handles:
 * - select_counterparty (UserSelectMenu)
 *
 * Responsibilities:
 * - Update flow state with the selected counterparty
 * - Mirror role for the counterparty (buyer <-> seller)
 * - Prompt for trade description via modal
 */

import { MessageFlags } from "discord.js";
import { getFlow, setFlow } from "../utils/flowRepo.js";
import { buildDescriptionModal } from "../utils/components.js";

/**
 * Handle the "select_counterparty" user select menu.
 *
 * @param {import('discord.js').Client} _client - The Discord client (unused here, present for future extensibility)
 * @param {import('discord.js').UserSelectMenuInteraction} interaction
 */
async function handleSelectCounterparty(_client, interaction) {
  const uid = interaction.user.id;

  // Ensure we have exactly one selected user
  if (!Array.isArray(interaction.values) || interaction.values.length === 0) {
    try {
      await interaction.reply({
        content: "⚠️ Please select a counterparty.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.error("Failed to prompt for counterparty selection:", e);
    }
    return;
  }

  const [counterpartyId] = interaction.values;

  // Update the initiator's flow with the counterparty and preserve the original token
  const existing = await getFlow(uid);
  await setFlow(uid, {
    counterpartyId,
    buyerAgreed: false,
    sellerAgreed: false,
    originalInteractionToken:
      (existing && existing.originalInteractionToken) || interaction.token,
  });

  // Mirror role for the counterparty based on initiator's role
  const initiatorFlow = (await getFlow(uid)) || {};
  const oppRole = initiatorFlow.role === "buyer" ? "seller" : "buyer";

  await setFlow(counterpartyId, {
    role: oppRole,
    counterpartyId: uid,
    buyerAgreed: false,
    sellerAgreed: false,
  });

  // Prompt for trade description
  const modal = buildDescriptionModal();
  await interaction.showModal(modal);
}

/**
 * Main select-menu dispatcher to be used by the top-level interaction handler.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').AnySelectMenuInteraction} interaction
 */
export async function handleSelect(client, interaction) {
  try {
    switch (interaction.customId) {
      case "select_counterparty":
        return handleSelectCounterparty(client, interaction);
      default:
        return;
    }
  } catch (err) {
    // Best-effort error response without throwing upstream
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: `❌ There was an error handling your selection: ${err.message}`,
        });
      } catch (e) {
        console.error("Failed to edit selection error reply:", e);
      }
    } else if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: `❌ There was an error handling your selection: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (e) {
        console.error("Failed to send selection error reply:", e);
      }
    }
  }
}

export default {
  handleSelect,
};
