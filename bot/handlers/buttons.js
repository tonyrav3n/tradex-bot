/**
 * Button interaction handlers extracted from the monolithic interactionCreate.js.
 *
 * Responsibilities:
 * - Handle button customIds:
 *   - create_trade_button (demo)
 *   - create_trade_flow_button
 *   - role_buyer / role_seller
 *   - create_
 *   - agree_buyer / agree_seller
 *   - mark_delivered / approve_release
 *
 * Notes:
 * - This module focuses on button interactions only. Modal submits and user selects
 *   should remain in their respective handlers/modules.
 * - We lock buyer/seller Discord IDs at thread creation to keep permissions consistent.
 */

import { MessageFlags, ChannelType } from "discord.js";

import { startFlow, setFlow, getFlow, clearFlow } from "../utils/flowRepo.js";
import {
  resolveLockedRoles,
  assertBuyer,
  assertSeller,
} from "../utils/roles.js";
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
import { safeThreadPatchMessage } from "../utils/threads.js";
import {
  getEscrowState,
  markEscrowDelivered,
  approveEscrowDelivery,
} from "../utils/escrow.js";
import {
  markDelivered as dbMarkDelivered,
  markCompleted as dbMarkCompleted,
} from "../utils/escrowRepo.js";

/**
 * Update the escrow status message if known, with the provided embed and action components
 * based on the updated status value or text.
 */
async function updateEscrowStatusMessage(interaction, uid, embed, updated) {
  const msgId = (await getFlow(uid))?.escrowStatusMessageId;
  if (!msgId) return;
  try {
    await safeThreadPatchMessage(
      interaction.channel,
      msgId,
      {
        embeds: [embed],
        components: buildActionsForStatus(updated.status ?? updated.statusText),
      },
      { extendDurationTo: 1440 },
    );
  } catch (e) {
    console.error("Failed to update escrow status message:", e);
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply({
    content: "🧭 Great! To start, what's your side of the trade?",
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
    content: "🤝 Got it. Who are you trading with?",
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
        "⚠️ Trade details are incomplete. Please restart with Create Trade.",
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
    embeds: [],
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
    priceUsd: flow.priceUsd,
  });

  const threadName = `trade-${uid.slice(-4)}-${flow.counterpartyId.slice(-4)}`;
  const thread = await interaction.channel.threads.create({
    name: threadName,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    invitable: false,
  });

  await thread.members.add(buyerId).catch(() => {});
  await thread.members.add(sellerId).catch(() => {});

  await thread.send({
    content: `👋 Welcome <@${buyerId}> and <@${sellerId}>`,
    embeds: [embed],
  });
  const agreeMsg = await thread.send({
    content: "✅ Please both click Agree to proceed.",
    components: [buildAgreeRow()],
  });

  await setFlow(uid, { threadId: thread.id, agreeMessageId: agreeMsg.id });
  await setFlow(flow.counterpartyId, {
    threadId: thread.id,
    agreeMessageId: agreeMsg.id,
  });

  const originalToken = flow?.originalInteractionToken;
  const appId = client?.application?.id;

  const payload = {
    content: `🔒 Perfect. I've created a private thread for you and your partner. Let's head there to finalise the trade: → <#${thread.id}>`,
    components: [],
    embeds: [],
  };

  if (originalToken && appId) {
    await updateEphemeralOriginal(appId, originalToken, payload);
  } else {
    await interaction.editReply(payload);
  }
}

/**
 * Show the buyer address modal (buyer only).
 */
async function handleAgreeBuyer(interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.editReply({
      content: "⚠️ No active trade flow found.",
      flags: MessageFlags.Ephemeral,
      components: [],
    });
    return;
  }
  const check = assertBuyer(uid, flow);
  if (!check.ok) {
    await interaction.reply({
      content: check.message,
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
      content: "ℹ️ You already agreed.",
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
      content: "⚠️ No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sellerId =
    flow.sellerDiscordId ??
    (flow.role === "seller" ? uid : flow.counterpartyId);
  if (uid !== sellerId) {
    await interaction.reply({
      content: "⚠️ You are not the seller for this trade.",
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
      content: "ℹ️ You already agreed.",
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.reply({
      content: "⚠️ No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const check = assertSeller(uid, flow);
  if (!check.ok) {
    await interaction.editReply({
      content: check.message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const escrowAddress = flow.escrowAddress;
  if (!escrowAddress) {
    await interaction.editReply({
      content: "⚠️ Escrow is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const state = await getEscrowState(escrowAddress);
    if (Number(state.status) !== 1) {
      await interaction.editReply({
        content: "⚠️ Trade is not at 'Funded' state.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { keyFor, checkCooldown, withLockThenCooldown } = await import(
      "../utils/locks.js"
    );
    const rateKey = keyFor("mark_delivered", escrowAddress);
    const cd = checkCooldown(rateKey);
    if (!cd.ok) {
      await interaction.editReply({
        content: `Action cooling down. Try again in ${Math.ceil(cd.remainingMs / 1000)}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const res = await withLockThenCooldown(rateKey, 10000, 5000, async () => {
      const tx = await markEscrowDelivered(escrowAddress);
      await publicClient.waitForTransactionReceipt({ hash: tx });
      return tx;
    });
    if (!res.ok) {
      if (res.remainingMs) {
        await interaction.editReply({
          content: `Action already in progress. Try again in ${Math.ceil(res.remainingMs / 1000)}s.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply({
          content: "Action could not start. Please try again shortly.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
    const txHash = res.value;
    try {
      await dbMarkDelivered(escrowAddress);
    } catch (e) {
      // non-fatal DB persistence failure
      console.error("DB persist delivered failed:", e);
    }

    const updated = await getEscrowState(escrowAddress);
    const { buyerId: buyerId2, sellerId: sellerId2 } = resolveLockedRoles(
      flow,
      uid,
    );

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      description: "Seller marked as Delivered.",
    });
    await updateEscrowStatusMessage(interaction, uid, embed2, updated);

    // Notify buyer in the thread about the next action
    await interaction.channel.send({
      content: `🔔 <@${buyerId2}> Seller marked delivered. Please approve & release.`,
      allowedMentions: { users: [String(buyerId2)], parse: [] },
    });

    await interaction.editReply({
      content: `✅ Marked delivered. Tx: ${txHash}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    await interaction.editReply({
      content: `❌ Failed to mark delivered: ${e.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Buyer approves delivery and releases funds (contract write via bot).
 */
async function handleApproveRelease(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.editReply({
      content: "⚠️ No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const buyerId =
    flow.buyerDiscordId ?? (flow.role === "buyer" ? uid : flow.counterpartyId);
  if (uid !== buyerId) {
    await interaction.editReply({
      content: "⚠️ You are not the buyer for this trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const escrowAddress = flow.escrowAddress;
  if (!escrowAddress) {
    await interaction.editReply({
      content: "⚠️ Escrow is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const state = await getEscrowState(escrowAddress);
    if (Number(state.status) !== 2) {
      await interaction.editReply({
        content: "⚠️ Trade is not at 'Delivered' state.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { keyFor, checkCooldown, withLockThenCooldown } = await import(
      "../utils/locks.js"
    );
    const rateKey = keyFor("approve_release", escrowAddress);
    const cd = checkCooldown(rateKey);
    if (!cd.ok) {
      await interaction.editReply({
        content: `Action cooling down. Try again in ${Math.ceil(cd.remainingMs / 1000)}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const res = await withLockThenCooldown(rateKey, 10000, 5000, async () => {
      const tx = await approveEscrowDelivery(escrowAddress);
      await publicClient.waitForTransactionReceipt({ hash: tx });
      return tx;
    });
    if (!res.ok) {
      if (res.remainingMs) {
        await interaction.editReply({
          content: `Action already in progress. Try again in ${Math.ceil(res.remainingMs / 1000)}s.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply({
          content: "Action could not start. Please try again shortly.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
    const txHash = res.value;
    try {
      await dbMarkCompleted(escrowAddress);
    } catch (e) {
      // non-fatal DB persistence failure
      console.error("DB persist completed failed:", e);
    }

    const updated = await getEscrowState(escrowAddress);
    const { buyerId: buyerId2, sellerId: sellerId2 } = resolveLockedRoles(
      flow,
      uid,
    );

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      description: "Buyer approved delivery. Funds released.",
    });
    await updateEscrowStatusMessage(interaction, uid, embed2, updated);

    // Notify seller in the thread about completion
    await interaction.channel.send({
      content: `🎉 <@${sellerId2}> Buyer approved delivery. Funds released.`,
      allowedMentions: { users: [String(sellerId2)], parse: [] },
    });

    await interaction.editReply({
      content: `✅ Approved and released. Tx: ${txHash}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    await interaction.editReply({
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
/**
 * Cancel the pre-thread confirmation prompt and clear all flow state for both users.
 */
async function handleCancelCreateThread(client, interaction) {
  const uid = interaction.user.id;
  const flow = await getFlow(uid);

  // Fully clear flows for both sides
  await clearFlow(uid);
  if (flow?.counterpartyId) {
    await clearFlow(flow.counterpartyId);
  }

  await interaction.update({
    content: "❌ Trade setup cancelled.",
    embeds: [],
    components: [],
  });
}

async function handleVerifyAssignRole(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      content: "⚠️ This button must be used in a server.",
    });
    return;
  }

  const roleId = String(process.env.VERIFIED_ROLE_ID || "").trim();
  if (!roleId) {
    await interaction.editReply({
      content:
        "⚠️ VERIFIED_ROLE_ID is not configured. Please set it in the environment.",
    });
    return;
  }

  try {
    const member =
      interaction.member ?? (await guild.members.fetch(interaction.user.id));
    const role =
      guild.roles.cache.get(roleId) ||
      (await guild.roles.fetch(roleId).catch(() => null));

    if (!role) {
      await interaction.editReply({
        content: "⚠️ The verification role could not be found.",
      });
      return;
    }

    if (member.roles?.cache?.has(roleId)) {
      await interaction.editReply({
        content: "ℹ️ You are already verified.",
      });
      return;
    }

    await member.roles.add(roleId, "Verify button assignment");
    await interaction.editReply({
      content: "✅ You have been verified and the role has been assigned.",
    });
  } catch (e) {
    await interaction.editReply({
      content: `❌ Failed to assign the verification role: ${e?.message || e}`,
    });
  }
}

export async function handleButton(client, interaction) {
  const id = interaction.customId;

  try {
    switch (id) {
      case "create_trade_flow_button":
        return handleStartFlow(client, interaction);
      case "role_buyer":
        return handleSelectRole(interaction, "buyer");
      case "role_seller":
        return handleSelectRole(interaction, "seller");
      case "create_thread":
        return handleCreateThread(client, interaction);
      case "cancel_create_thread":
        return handleCancelCreateThread(client, interaction);
      case "agree_buyer":
        return handleAgreeBuyer(interaction);
      case "agree_seller":
        return handleAgreeSeller(interaction);
      case "mark_delivered":
        return handleMarkDelivered(interaction);
      case "approve_release":
        return handleApproveRelease(interaction);
      case "verify_assign_role":
        return handleVerifyAssignRole(interaction);
      default:
        // No-op for unknown buttons
        return;
    }
  } catch (err) {
    // Best-effort error response without throwing upstream
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: `❌ There was an error handling your button: ${err.message}`,
        });
      } catch (e) {
        console.error("Failed to edit button error reply:", e);
      }
    } else if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: `❌ There was an error handling your button: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (e) {
        console.error("Failed to send button error reply:", e);
      }
    }
  }
}

export default {
  handleButton,
};
