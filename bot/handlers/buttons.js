/**
 * Button interaction handlers for trade flow and Amis manager actions.
 *
 * Responsibilities:
 * - Handle button customIds:
 *   - create_trade_button (demo)
 *   - create_trade_flow_button
 *   - role_buyer / role_seller
 *   - agree_buyer / agree_seller
 *   - mark_delivered / approve_release
 *   - prefund_quote
 *
 * Notes:
 * - This module focuses on button interactions only. Modal submits and user selects
 *   should remain in their respective handlers/modules.
 * - Uses AmisEscrowManager (tradeId-based). Buyer funds via fund(tradeId).
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
import { convertUsdToEth } from "../utils/fx.js";
import { safeThreadPatchMessage } from "../utils/threads.js";

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
  try {
    await interaction.showModal(buildBuyerAddressModal());
  } catch (e) {
    console.error("handleAgreeBuyer: showModal failed:", e);
    const msg = (e && (e.rawError?.message || e.message)) || "";
    const isUnknown =
      String(msg).toLowerCase().includes("unknown interaction") ||
      (e && Number(e.code) === 10062);

    // Try to guide the user to retry
    try {
      await interaction.reply({
        content: isUnknown
          ? "This interaction expired. Please click the button again to open the form."
          : "Couldn’t open the form. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // Last resort: post a visible notice in the thread to guide the user
      try {
        await interaction.channel.send({
          content: `⚠️ <@${interaction.user.id}> ${
            isUnknown
              ? "That interaction expired. Please press the button again to open the form."
              : "Couldn’t open the form. Please try again."
          }`,
          allowedMentions: { users: [String(interaction.user.id)], parse: [] },
        });
      } catch {
        // swallow
      }
    }
  }
}

/**
 * Show the seller address modal (seller only).
 */
async function handleAgreeSeller(interaction) {
  try {
    await interaction.showModal(buildSellerAddressModal());
  } catch (e) {
    console.error("handleAgreeSeller: showModal failed:", e);
    const msg = (e && (e.rawError?.message || e.message)) || "";
    const isUnknown =
      String(msg).toLowerCase().includes("unknown interaction") ||
      (e && Number(e.code) === 10062);

    // Try to guide the user to retry
    try {
      await interaction.reply({
        content: isUnknown
          ? "This interaction expired. Please click the button again to open the form."
          : "Couldn’t open the form. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // Last resort: post a visible notice in the thread to guide the user
      try {
        await interaction.channel.send({
          content: `⚠️ <@${interaction.user.id}> ${
            isUnknown
              ? "That interaction expired. Please press the button again to open the form."
              : "Couldn’t open the form. Please try again."
          }`,
          allowedMentions: { users: [String(interaction.user.id)], parse: [] },
        });
      } catch {
        // swallow
      }
    }
  }
}

/**
 * Seller marks delivered (contract write via bot).
 */
async function handleMarkDelivered(interaction) {
  await interaction.reply({
    content: "⏳ Processing...",
    flags: MessageFlags.Ephemeral,
  });
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.editReply({
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
  const tradeId = flow.tradeId;
  if (!tradeId) {
    await interaction.editReply({
      content: "⚠️ Trade is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const { getTradeState, markDelivered: amisMarkDelivered } = await import(
      "../utils/amis.js"
    );
    const { AMIS_ADDRESS } = await import("../utils/amisContract.js");

    const state = await getTradeState(tradeId);
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
    const rateKey = keyFor("mark_delivered", String(tradeId));
    const cd = checkCooldown(rateKey);
    if (!cd.ok) {
      await interaction.editReply({
        content: `Action cooling down. Try again in ${Math.ceil(cd.remainingMs / 1000)}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const res = await withLockThenCooldown(rateKey, 10000, 5000, async () => {
      const tx = await amisMarkDelivered(tradeId);
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

    const updated = await getTradeState(tradeId);
    const { buyerId: buyerId2, sellerId: sellerId2 } = resolveLockedRoles(
      flow,
      uid,
    );

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress: AMIS_ADDRESS,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      priceUsd: flow?.priceUsd,
      description: "Seller marked as Delivered.",
    });
    await updateEscrowStatusMessage(interaction, uid, embed2, updated);

    // Notify buyer in the thread about the next action
    await interaction.channel.send({
      content: `🔔 <@${buyerId2}> Seller marked delivered. Please approve & release.`,
      allowedMentions: { users: [String(buyerId2)], parse: [] },
    });
    // Post a countdown banner and release breakdown
    try {
      // Chain-aware deadline from on-chain deliveryTimestamp + releaseTimeout (fallback to 24h from now)
      const deliveredAt = Number(updated?.deliveredAtSec ?? 0);
      const timeoutSec = Number(updated?.releaseTimeoutSec ?? 0);
      const deadline =
        deliveredAt > 0 && timeoutSec > 0
          ? deliveredAt + timeoutSec
          : Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      const lines = [
        `⏳ Auto‑release available at: <t:${deadline}:F> (that is <t:${deadline}:R>).`,
      ];
      await interaction.channel.send({ content: lines.join("\n") });
    } catch (e) {
      console.warn("Countdown banner failed:", e);
    }

    await interaction.editReply({
      content: `✅ Marked delivered.`,
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
  await interaction.reply({
    content: "⏳ Processing...",
    flags: MessageFlags.Ephemeral,
  });
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
  const tradeId = flow.tradeId;
  if (!tradeId) {
    await interaction.editReply({
      content: "⚠️ Trade is not created yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const { getTradeState, approveDelivery: amisApproveDelivery } =
      await import("../utils/amis.js");
    const { AMIS_ADDRESS } = await import("../utils/amisContract.js");

    const state = await getTradeState(tradeId);
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
    const rateKey = keyFor("approve_release", String(tradeId));
    const cd = checkCooldown(rateKey);
    if (!cd.ok) {
      await interaction.editReply({
        content: `Action cooling down. Try again in ${Math.ceil(cd.remainingMs / 1000)}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Show release breakdown to the buyer before submitting the transaction
    try {
      const amt = Number.parseFloat(String(state?.amountEth ?? "0"));
      const fee = Number.isFinite(amt) ? amt * 0.025 : null;
      const payout = Number.isFinite(amt) ? amt * 0.975 : null;
      const fmt = (n, d = 6) =>
        Number(n)
          .toFixed(d)
          .replace(/(\.\d*?[1-9])0+$/u, "$1")
          .replace(/\.0+$/u, ".0")
          .replace(/\.$/u, "");
      const parts = [
        `Release breakdown:`,
        `• Base (escrowed): ${Number.isFinite(amt) ? fmt(amt) : "—"} ETH`,
        `• Seller fee (2.5%): ${fee != null ? fmt(fee) : "—"} ETH`,
        `• Seller receives: ${payout != null ? fmt(payout) : "—"} ETH`,
        `Submitting approval...`,
      ];
      await interaction.editReply({
        content: parts.join("\n"),
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.warn("Release breakdown preflight failed:", err);
    }
    const res = await withLockThenCooldown(rateKey, 10000, 5000, async () => {
      const tx = await amisApproveDelivery(tradeId);
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

    const updated = await getTradeState(tradeId);
    const { buyerId: buyerId2, sellerId: sellerId2 } = resolveLockedRoles(
      flow,
      uid,
    );

    const embed2 = buildEscrowStatusEmbed({
      escrowAddress: AMIS_ADDRESS,
      buyerId: buyerId2,
      sellerId: sellerId2,
      statusText: updated.statusText,
      amountEth: updated.amountEth,
      color: updated.color,
      priceUsd: flow?.priceUsd,
      description: "Buyer approved delivery. Funds released.",
    });
    await updateEscrowStatusMessage(interaction, uid, embed2, updated);

    // Notify seller in the thread about completion
    await interaction.channel.send({
      content: `🎉 <@${sellerId2}> Buyer approved delivery. Funds released.`,
      allowedMentions: { users: [String(sellerId2)], parse: [] },
    });

    await interaction.editReply({
      content: `✅ Approved and released.`,
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
/**
 * Buyer-only: show a pre‑fund quote with base amount, 2.5% fee, and total. No payment link.
 */
async function handlePreFundQuote(interaction) {
  await interaction.reply({
    content: "⏳ Processing...",
    flags: MessageFlags.Ephemeral,
  });
  const uid = interaction.user.id;
  const flow = await getFlow(uid);
  if (!flow) {
    await interaction.editReply({
      content: "⚠️ No active trade flow found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const check = assertBuyer(uid, flow);
  if (!check.ok) {
    await interaction.editReply({
      content: check.message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const tradeId = flow?.tradeId;
  if (!tradeId) {
    await interaction.editReply({
      content:
        "ℹ️ Trade isn’t created yet. The quote is only available after the trade has been created (awaiting funding).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Allow the pre‑fund quote only while the trade is in Created (awaiting funding)
  try {
    const { getTradeState } = await import("../utils/amis.js");
    const state = await getTradeState(tradeId);
    if (Number(state?.status) !== 0) {
      await interaction.editReply({
        content:
          "ℹ️ The pre‑fund quote is only available while the trade is awaiting funding.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } catch {
    // If we cannot read state, proceed with caution (trade exists)
  }

  // Prefer pinned ETH at creation; fallback to live FX from USD if available
  let baseEthStr = flow?.priceEthAtCreation ?? null;
  if (!baseEthStr && flow?.priceUsd) {
    try {
      baseEthStr = (await convertUsdToEth(flow.priceUsd)).eth;
    } catch {
      // ignore
    }
  }
  const baseEth = Number.parseFloat(String(baseEthStr ?? "0"));
  if (!Number.isFinite(baseEth) || baseEth <= 0) {
    await interaction.editReply({
      content:
        "Couldn’t compute the base amount yet. Ensure a USD price was set when creating the trade.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const buyerFee = baseEth * 0.025;
  const totalEth = baseEth * 1.025;
  const fmt = (n, d = 6) =>
    Number(n)
      .toFixed(d)
      .replace(/(\.\d*?[1-9])0+$/u, "$1")
      .replace(/\.0+$/u, ".0")
      .replace(/\.$/u, "");

  const { AMIS_ADDRESS } = await import("../utils/amisContract.js");
  const lines = [
    `Pre‑fund quote (buyer):`,
    `• Escrow amount (base): ${fmt(baseEth)} ETH`,
    `• Buyer fee (2.5%): ${fmt(buyerFee)} ETH`,
    `• Total to send: ${fmt(totalEth)} ETH`,
    `• Trade ID: ${tradeId}`,
    `• Contract: \`${AMIS_ADDRESS}\``,
    `Use your wallet to call fund(tradeId) with the total amount.`,
  ];
  await interaction.editReply({
    content: lines.join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
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
      content: "✅ You have been verified and now have access to the server!.",
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
      case "prefund_quote":
        return handlePreFundQuote(interaction);
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
