import { MessageFlags } from 'discord.js';

import { logger } from '../utils/logger.js';
import { normalizeUsdAmount } from '../utils/validation.js';

async function handleTradeDetailsModal(interaction) {
  const userId = interaction.user.id;

  // Extract customId parts: trade_details_mdl:buyer:123456789
  const [, role, selectedUserId] = interaction.customId.split(':');

  const selectedRole = role === 'buyer' ? 'Buyer' : 'Seller';

  // Extract field values
  const item = interaction.fields.getTextInputValue('item_input');
  const priceInput = interaction.fields.getTextInputValue('price_input');
  const description = interaction.fields.getTextInputValue('description_input');

  // Log modal submission for debugging
  logger.modal(interaction.customId, userId, {
    item,
    priceInput,
    hasDescription: !!description,
  });

  const priceValidation = normalizeUsdAmount(priceInput);

  if (!priceValidation.ok) {
    logger.warn('Price validation failed', {
      userId,
      priceInput,
      error: priceValidation.error,
    });
    await interaction.reply({
      content: `❌ **Invalid Price:** ${priceValidation.error}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const normalizedPrice = priceValidation.value;
  const priceNumber = priceValidation.number;

  logger.success('Trade details validated successfully', {
    userId,
    role,
    selectedUserId,
    item,
    price: normalizedPrice,
    hasDescription: !!description,
  });

  await interaction.reply({
    content:
      `✅ **Trade Details Received**\n\n` +
      `**Item:** ${item}\n` +
      `**Price:** $${normalizedPrice}\n` +
      `**Role:** ${selectedRole}\n` +
      `**Counterparty:** <@${selectedUserId}>\n${
        description ? `**Details:** ${description}\n` : ''
      }\n*Next steps will be implemented soon...*`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleModal(interaction) {
  const { customId } = interaction;
  const userId = interaction.user.id;

  logger.modal(customId, userId);

  try {
    const baseId = customId.split(':')[0];

    switch (baseId) {
      case 'trade_details_mdl':
        await handleTradeDetailsModal(interaction);
        break;

      default:
        logger.warn(`Unknown modal customId: ${customId}`, { userId });
    }
  } catch (error) {
    logger.error(`Error handling modal ${customId}:`, error, { userId });

    try {
      await interaction.reply({
        content: `❌ An error occurred processing your submission.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (replyError) {
      logger.error('Failed to send error reply:', replyError, { userId });
    }
  }
}

export default {
  handleModal,
};
