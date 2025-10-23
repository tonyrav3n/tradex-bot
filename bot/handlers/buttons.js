/**
 * Button interaction handlers extracted from the monolithic interactionCreate.js.
 *
 * Responsibilities:
 * - Handle button customIds:
 *   - create_trade_button (demo)
 *   - create_trade_flow_button
 *   - role_buyer / role_seller
 *   - create_thread
 *   - agree_buyer / agree_seller
 *   - mark_delivered / approve_release
 *
 * Notes:
 * - This module focuses on button interactions only. Modal submits and user selects
 *   should remain in their respective handlers/modules.
 * - We lock buyer/seller Discord IDs at thread creation to keep permissions consistent.
 */

import { MessageFlags, ChannelType } from "discord.js";
import { createTrade } from "../utils/createTrade.js";
import { startFlow, setFlow, getFlow } from "../utils/flowRepo.js";
import {
  buildRoleButtonsRow,
  buildCounterpartySelectRow,
  buildCreatedEmbed,
  buildAgreeRow,
  buildBuyerAddressModal,
  buildSellerAddressModal,
  buildEscrowStatusEmbed,
  buildActionsForStatus,
} from "../utils/components.js";
import { updateEphemeralOriginal } from "../utils/ephemeral.js";
import { publicClient } from "../utils/client.js";
import {
  getEscrowState,
  markEscrowDelivered,
  approveEscrowDelivery,
} from "../utils/escrow.js";
import { deriveEscrowAddressFromTx } from "../utils/deriveEscrowAddress.js";

/**
 * Safely defer a reply if not already deferred/replied.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} options
 */
async function safeDeferReply(
  interaction,
  options = { flags: MessageFlags.Ephemeral },
) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply(options);
  }
}

/**
 * Handle "create_trade_button" demo flow:
 * - Creates a demo trade with hardcoded buyer/seller and amount.
 */
async function handleDemoCreate(interaction) {
  await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });

  const buyer = "0x8748B8d799754DA4bD9B5640e444b59E957F8f8E";
  const seller = "0xe3378EE2b08284f5ac0c2695d4029E1C444beE6F";
  const amount = "0.001";

  try {
    const txHash = await createTrade(buyer, seller, amount);
    await interaction.editReply({
      content: `✅ Trade successfully created!\n\nTransaction hash: ${txHash}`,
    });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Failed to create trade:\n${err.message}`,
    });
  }
}

/**
 * Start the multi-step Create Trade flow:
 * - Initializes a flow and asks the user for their role.
 */
async function handleStartFlow(client, interaction) {
  const uid = interaction.user.id;
  await startFlow(uid);
  await setFlow(uid, { originalInteractionToken: interaction.token });

  await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });
  await interaction.editReply({
    content: "What is your role in this trade?",
    components: [buildRoleButtonsRow()],
  });
}

/**
 * Handle role selection:
 * - Saves role and asks to select the counterparty.
 */
async function handleSelectRole(interaction, role) {
  const uid = interaction.user.id;
  const existing = await getFlow(uid);
  await setFlow(uid, {
    role,
    originalInteractionToken:
      (existing && existing.originalInteractionToken) || interaction.token,
  });

  // Role buttons are in an ephemeral message; use deferUpdate to replace components
  await interaction.deferUpdate();
  await interaction.editReply({
    content: "Select the counterparty:",
    components: [buildCounterpartySelectRow()],
  });
}

/**
 * Handle creating the private thread and locking buyer/seller Discord IDs.
 */
async function handleCreateThread(client, interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow || !flow.role || !flow.counterpartyId || !flow.description) {
    return interaction.update({
      content:
        "Trade details are incomplete. Please restart with Create Trade.",
      components: [],
    });
  }
  if (flow.threadId) {
    try {
      const existingThread = await interaction.channel.threads.fetch(
        flow.threadId,
      );
      if (existingThread) {
        return interaction.update({
          content: `✅ Private thread already exists: <#${flow.threadId}>`,
          components: [],
        });
      }
    } catch {
      // Stale thread id; clear and proceed to create a fresh one
      await setFlow(uid, {
        threadId: null,
        agreeMessageId: null,
        buyerAgreed: false,
        sellerAgreed: false,
        buyerAddress: null,
        sellerAddress: null,
      });
      if (flow?.counterpartyId) {
        await setFlow(flow.counterpartyId, {
          threadId: null,
          agreeMessageId: null,
          buyerAgreed: false,
          sellerAgreed: false,
          buyerAddress: null,
          sellerAddress: null,
        });
      }
    }
  }

  await interaction.update({
    content: "⏳ Creating private thread...",
    components: [],
  });

  const buyerId = flow.role === "buyer" ? uid : flow.counterpartyId;
  const sellerId = flow.role === "seller" ? uid : flow.counterpartyId;

  // Lock buyer/seller Discord IDs for both parties
  await setFlow(uid, {
    buyerDiscordId: buyerId,
    sellerDiscordId: sellerId,
    buyerAgreed: false,
    sellerAgreed: false,
    buyerAddress: null,
    sellerAddress: null,
    escrowAddress: null,
    escrowStatusMessageId: null,
    escrowWatcherStarted: false,
    agreeMessageId: null,
  });
  if (flow?.counterpartyId) {
    await setFlow(flow.counterpartyId, {
      buyerDiscordId: buyerId,
      sellerDiscordId: sellerId,
      buyerAgreed: false,
      sellerAgreed: false,
      buyerAddress: null,
      sellerAddress: null,
      escrowAddress: null,
      escrowStatusMessageId: null,
      escrowWatcherStarted: false,
      agreeMessageId: null,
    });
  }

  const embed = buildCreatedEmbed({
    buyerId,
    sellerId,
    description: flow.description,
  });

  const threadName = `trade-${uid.slice(-4)}-${flow.counterpartyId.slice(-4)}`;
  const thread = await interaction.channel.threads.create({
    name: threadName,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
  });

  await thread.members.add(buyerId).catch(() => {});
  await thread.members.add(sellerId).catch(() => {});

  await thread.send({
    content: `Welcome <@${buyerId}> and <@${sellerId}>`,
    embeds: [embed],
  });
  const agreeMsg = await thread.send({
    content: "Please both click Agree to proceed.",
    components: [buildAgreeRow()],
  });

  await setFlow(uid, { threadId: thread.id, agreeMessageId: agreeMsg.id });
  await setFlow(flow.counterpartyId, {
    threadId: thread.id,
    agreeMessageId: agreeMsg.id,
  });

  const originalToken = flow?.originalInteractionToken;
  const appId = client?.application?.id;
  if (originalToken && appId) {
    await updateEphemeralOriginal(appId, originalToken, {
      content: `✅ Private thread created: <#${thread.id}>`,
      components: [],
    });
  } else {
    await interaction.editReply({
      content: `✅ Private thread created: <#${thread.id}>`,
      components: [],
    });
  }
}

/**
 * Show the buyer address modal (buyer only).
 */
async function handleAgreeBuyer(interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.reply({
      content: "No active trade flow found.",
      flags: MessageFlags.Ephemeral,
      components: [],
    });
    return;
  }
  const buyerId =
    flow.buyerDiscordId ?? (flow.role === "buyer" ? uid : flow.counterpartyId);
  if (uid !== buyerId) {
    await interaction.reply({
      content: "You are not the buyer for this trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Guard against stale flow: ensure this agree action is for the current thread
  const currentThreadId = interaction.channel?.id;
  if (currentThreadId && flow.threadId && flow.threadId !== currentThreadId) {
    await setFlow(uid, {
      buyerAgreed: false,
      buyerAddress: null,
      threadId: currentThreadId,
    });
  }

  const fresh = (await getFlow(uid)) || flow;

  // Only block as 'already agreed' if we have a positive agreement with an address
  if (fresh.buyerAgreed && fresh.buyerAddress) {
    await interaction.reply({
      content: "You already agreed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.showModal(buildBuyerAddressModal());
}

/**
 * Show the seller address modal (seller only).
 */
async function handleAgreeSeller(interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.reply({
      content: "No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sellerId =
    flow.sellerDiscordId ??
    (flow.role === "seller" ? uid : flow.counterpartyId);
  if (uid !== sellerId) {
    await interaction.reply({
      content: "You are not the seller for this trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Guard against stale flow: ensure this agree action is for the current thread
  const currentThreadId = interaction.channel?.id;
  if (currentThreadId && flow.threadId && flow.threadId !== currentThreadId) {
    await setFlow(uid, {
      sellerAgreed: false,
      sellerAddress: null,
      threadId: currentThreadId,
    });
  }

  const fresh = (await getFlow(uid)) || flow;

  // Only block as 'already agreed' if we have a positive agreement with an address
  if (fresh.sellerAgreed && fresh.sellerAddress) {
    await interaction.reply({
      content: "You already agreed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.showModal(buildSellerAddressModal());
}

/**
 * Seller marks delivered (contract write via bot).
 */
async function handleMarkDelivered(interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.reply({
      content: "No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sellerId =
    flow.sellerDiscordId ??
    (flow.role === "seller" ? uid : flow.counterpartyId);
  if (uid !== sellerId) {
    await interaction.reply({
      content: "You are not the seller for this trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const escrowAddress = flow.escrowAddress;
  if (!escrowAddress) {
    await interaction.reply({
      content: "Escrow is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const state = await getEscrowState(escrowAddress);
    if (Number(state.status) !== 1) {
      await interaction.reply({
        content: "Trade is not at 'Funded' state.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const txHash = await markEscrowDelivered(escrowAddress);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const updated = await getEscrowState(escrowAddress);
    const buyerId2 =
      flow.buyerDiscordId ??
      (flow.role === "buyer" ? uid : flow.counterpartyId);
    const sellerId2 =
      flow.sellerDiscordId ??
      (flow.role === "seller" ? uid : flow.counterpartyId);

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      title: "Escrow Status",
      description: "Seller marked as Delivered.",
    });
    const msgId = (await getFlow(uid))?.escrowStatusMessageId;
    if (msgId) {
      try {
        const msg = await interaction.channel.messages.fetch(msgId);
        await msg.edit({
          embeds: [embed2],
          components: buildActionsForStatus(
            updated.status ?? updated.statusText,
          ),
        });
      } catch {}
    }

    await interaction.reply({
      content: `✅ Marked delivered. Tx: ${txHash}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    await interaction.reply({
      content: `❌ Failed to mark delivered: ${e.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Buyer approves delivery and releases funds (contract write via bot).
 */
async function handleApproveRelease(interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.reply({
      content: "No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const buyerId =
    flow.buyerDiscordId ?? (flow.role === "buyer" ? uid : flow.counterpartyId);
  if (uid !== buyerId) {
    await interaction.reply({
      content: "You are not the buyer for this trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const escrowAddress = flow.escrowAddress;
  if (!escrowAddress) {
    await interaction.reply({
      content: "Escrow is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const state = await getEscrowState(escrowAddress);
    if (Number(state.status) !== 2) {
      await interaction.reply({
        content: "Trade is not at 'Delivered' state.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const txHash = await approveEscrowDelivery(escrowAddress);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const updated = await getEscrowState(escrowAddress);
    const buyerId2 =
      flow.buyerDiscordId ??
      (flow.role === "buyer" ? uid : flow.counterpartyId);
    const sellerId2 =
      flow.sellerDiscordId ??
      (flow.role === "seller" ? uid : flow.counterpartyId);

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      title: "Escrow Status",
      description: "Buyer approved delivery. Funds released.",
    });
    const msgId = (await getFlow(uid))?.escrowStatusMessageId;
    if (msgId) {
      try {
        const msg = await interaction.channel.messages.fetch(msgId);
        await msg.edit({
          embeds: [embed2],
          components: buildActionsForStatus(
            updated.status ?? updated.statusText,
          ),
        });
      } catch {}
    }

    await interaction.reply({
      content: `✅ Approved and released. Tx: ${txHash}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    await interaction.reply({
      content: `❌ Failed to approve/release: ${e.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Main button dispatcher to be used by the top-level interaction handler.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleButton(client, interaction) {
  const id = interaction.customId;

  try {
    switch (id) {
      case "create_trade_button":
        return handleDemoCreate(interaction);
      case "create_trade_flow_button":
        return handleStartFlow(client, interaction);
      case "role_buyer":
        return handleSelectRole(interaction, "buyer");
      case "role_seller":
        return handleSelectRole(interaction, "seller");
      case "create_thread":
        return handleCreateThread(client, interaction);
      case "agree_buyer":
        return handleAgreeBuyer(interaction);
      case "agree_seller":
        return handleAgreeSeller(interaction);
      case "mark_delivered":
        return handleMarkDelivered(interaction);
      case "approve_release":
        return handleApproveRelease(interaction);
      default:
        // No-op for unknown buttons
        return;
    }
  } catch (err) {
    // Best-effort error response without throwing upstream
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: `There was an error handling your button: ${err.message}`,
        });
      } catch {}
    } else if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: `There was an error handling your button: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
}

export default {
  handleButton,
};
