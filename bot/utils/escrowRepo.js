import { query } from "./db.js";

/**
 * Escrow Repository (PostgreSQL)
 *
 * Stores and updates escrow records in the "escrows" table.
 * This is designed to be used by the bot at key points:
 * - Immediately after creating an escrow (record creation context)
 * - When status changes (Funded, Delivered, Completed, etc.)
 * - When Discord context changes (thread/message references)
 * - To fetch records by address/thread for display or debugging
 *
 * Columns (see migration 20251023_000001_init.sql):
 *   id BIGSERIAL PRIMARY KEY
 *   escrow_address TEXT NOT NULL UNIQUE
 *   factory_tx_hash TEXT NULL
 *   channel_id TEXT NULL
 *   thread_id TEXT NULL
 *   status_message_id TEXT NULL
 *   creator_user_id TEXT NULL
 *   buyer_discord_id TEXT NULL
 *   seller_discord_id TEXT NULL
 *   buyer_address TEXT NULL
 *   seller_address TEXT NULL
 *   amount_wei NUMERIC(78,0) NULL
 *   status SMALLINT NULL
 *   status_text TEXT NULL
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 */

export const ESCROW_STATUS = Object.freeze({
  Created: 0,
  Funded: 1,
  Delivered: 2,
  Completed: 3,
  Cancelled: 4,
  Disputed: 5,
});

/**
 * Map numeric status to human label.
 * @param {number|bigint|null|undefined} status
 * @returns {string}
 */
export function statusLabel(status) {
  const s = Number(status);
  switch (s) {
    case ESCROW_STATUS.Created:
      return "Created";
    case ESCROW_STATUS.Funded:
      return "Funded";
    case ESCROW_STATUS.Delivered:
      return "Delivered";
    case ESCROW_STATUS.Completed:
      return "Completed";
    case ESCROW_STATUS.Cancelled:
      return "Cancelled";
    case ESCROW_STATUS.Disputed:
      return "Disputed";
    default:
      return "Unknown";
  }
}

/**
 * Convert DB row to JS object.
 * @param {any} row
 */
function rowToEscrow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    escrowAddress: row.escrow_address ?? null,
    factoryTxHash: row.factory_tx_hash ?? null,
    channelId: row.channel_id ?? null,
    threadId: row.thread_id ?? null,
    statusMessageId: row.status_message_id ?? null,
    creatorUserId: row.creator_user_id ?? null,
    buyerDiscordId: row.buyer_discord_id ?? null,
    sellerDiscordId: row.seller_discord_id ?? null,
    buyerAddress: row.buyer_address ?? null,
    sellerAddress: row.seller_address ?? null,
    amountWei:
      row.amount_wei !== null && row.amount_wei !== undefined
        ? String(row.amount_wei)
        : null,
    status:
      row.status !== null && row.status !== undefined
        ? Number(row.status)
        : null,
    statusText: row.status_text ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Normalize amount into string for NUMERIC(78,0).
 * Accepts bigint | string | number | null/undefined
 * @param {bigint|string|number|null|undefined} v
 * @returns {string|null}
 */
function toDbAmount(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return Math.trunc(v).toString();
  }
  if (typeof v === "string") return v;
  return null;
}

/**
 * Columns used for INSERT/UPSERT (order matters with values array).
 */
const columns = [
  "escrow_address",
  "factory_tx_hash",
  "channel_id",
  "thread_id",
  "status_message_id",
  "creator_user_id",
  "buyer_discord_id",
  "seller_discord_id",
  "buyer_address",
  "seller_address",
  "amount_wei",
  "status",
  "status_text",
];

/**
 * Build values array aligned with columns.
 * @param {object} e
 */
function toValues(e) {
  return [
    e.escrowAddress ?? null,
    e.factoryTxHash ?? null,
    e.channelId ?? null,
    e.threadId ?? null,
    e.statusMessageId ?? null,
    e.creatorUserId ?? null,
    e.buyerDiscordId ?? null,
    e.sellerDiscordId ?? null,
    e.buyerAddress ?? null,
    e.sellerAddress ?? null,
    toDbAmount(e.amountWei),
    e.status !== undefined && e.status !== null ? Number(e.status) : null,
    e.statusText ?? null,
  ];
}

/**
 * Upsert an escrow record. Uses escrow_address as the unique identifier.
 * @param {object} escrow
 * @returns {Promise<object>}
 */
export async function upsertEscrow(escrow) {
  if (!escrow || !escrow.escrowAddress) {
    throw new Error("upsertEscrow: 'escrowAddress' is required");
  }

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "escrow_address")
    .map((c) => `${c}=EXCLUDED.${c}`)
    .join(", ");

  const sql = `
    INSERT INTO escrows (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (escrow_address) DO UPDATE SET
      ${updates}
    RETURNING *
  `;

  const res = await query(sql, toValues(escrow));
  return rowToEscrow(res.rows[0]);
}

/**
 * Create a new escrow record right after factory creation.
 * If it exists, merges provided fields.
 *
 * @param {object} params
 * @param {string} params.escrowAddress
 * @param {string} [params.factoryTxHash]
 * @param {string} [params.channelId]
 * @param {string} [params.threadId]
 * @param {string} [params.statusMessageId]
 * @param {string} [params.creatorUserId]
 * @param {string} [params.buyerDiscordId]
 * @param {string} [params.sellerDiscordId]
 * @param {string} [params.buyerAddress]
 * @param {string} [params.sellerAddress]
 * @returns {Promise<object>}
 */
export async function recordEscrowCreation(params) {
  const payload = {
    escrowAddress: params.escrowAddress,
    factoryTxHash: params.factoryTxHash ?? null,
    channelId: params.channelId ?? null,
    threadId: params.threadId ?? null,
    statusMessageId: params.statusMessageId ?? null,
    creatorUserId: params.creatorUserId ?? null,
    buyerDiscordId: params.buyerDiscordId ?? null,
    sellerDiscordId: params.sellerDiscordId ?? null,
    buyerAddress: params.buyerAddress ?? null,
    sellerAddress: params.sellerAddress ?? null,
    amountWei: null,
    status: ESCROW_STATUS.Created,
    statusText: statusLabel(ESCROW_STATUS.Created),
  };
  return upsertEscrow(payload);
}

/**
 * Update escrow status and optionally amount and status text.
 * @param {string} escrowAddress
 * @param {{ status?: number|bigint|null, amountWei?: string|number|bigint|null, statusText?: string|null }} patch
 */
export async function setEscrowStatus(escrowAddress, patch = {}) {
  if (!escrowAddress)
    throw new Error("setEscrowStatus: escrowAddress required");
  const fields = [];
  const values = [];
  let idx = 1;

  if (patch.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(patch.status !== null ? Number(patch.status) : null);
  }
  if (patch.amountWei !== undefined) {
    fields.push(`amount_wei = $${idx++}`);
    values.push(toDbAmount(patch.amountWei));
  }
  if (patch.statusText !== undefined) {
    fields.push(`status_text = $${idx++}`);
    values.push(patch.statusText);
  }
  // If status provided but statusText omitted, auto-fill label
  if (
    patch.status !== undefined &&
    patch.status !== null &&
    patch.statusText === undefined
  ) {
    fields.push(`status_text = $${idx++}`);
    values.push(statusLabel(patch.status));
  }

  if (fields.length === 0) return getEscrowByAddress(escrowAddress);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE escrow_address = $${idx}
    RETURNING *
  `;
  values.push(escrowAddress);

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Update the Discord context for the escrow.
 * @param {string} escrowAddress
 * @param {{ channelId?: string|null, threadId?: string|null, statusMessageId?: string|null }} ctx
 */
export async function setEscrowDiscordContext(escrowAddress, ctx = {}) {
  if (!escrowAddress)
    throw new Error("setEscrowDiscordContext: escrowAddress required");
  const fields = [];
  const values = [];
  let i = 1;

  if (ctx.channelId !== undefined) {
    fields.push(`channel_id = $${i++}`);
    values.push(ctx.channelId);
  }
  if (ctx.threadId !== undefined) {
    fields.push(`thread_id = $${i++}`);
    values.push(ctx.threadId);
  }
  if (ctx.statusMessageId !== undefined) {
    fields.push(`status_message_id = $${i++}`);
    values.push(ctx.statusMessageId);
  }

  if (fields.length === 0) return getEscrowByAddress(escrowAddress);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE escrow_address = $${i}
    RETURNING *
  `;
  values.push(escrowAddress);

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Update the parties (Discord and/or on-chain addresses).
 * @param {string} escrowAddress
 * @param {{ buyerDiscordId?: string|null, sellerDiscordId?: string|null, buyerAddress?: string|null, sellerAddress?: string|null }} patch
 */
export async function setEscrowParties(escrowAddress, patch = {}) {
  if (!escrowAddress)
    throw new Error("setEscrowParties: escrowAddress required");
  const fields = [];
  const values = [];
  let i = 1;

  if (patch.buyerDiscordId !== undefined) {
    fields.push(`buyer_discord_id = $${i++}`);
    values.push(patch.buyerDiscordId);
  }
  if (patch.sellerDiscordId !== undefined) {
    fields.push(`seller_discord_id = $${i++}`);
    values.push(patch.sellerDiscordId);
  }
  if (patch.buyerAddress !== undefined) {
    fields.push(`buyer_address = $${i++}`);
    values.push(patch.buyerAddress);
  }
  if (patch.sellerAddress !== undefined) {
    fields.push(`seller_address = $${i++}`);
    values.push(patch.sellerAddress);
  }

  if (fields.length === 0) return getEscrowByAddress(escrowAddress);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE escrow_address = $${i}
    RETURNING *
  `;
  values.push(escrowAddress);

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Set the amount_wei explicitly.
 * @param {string} escrowAddress
 * @param {bigint|string|number|null} amountWei
 */
export async function setEscrowAmount(escrowAddress, amountWei) {
  if (!escrowAddress)
    throw new Error("setEscrowAmount: escrowAddress required");
  const sql = `
    UPDATE escrows
    SET amount_wei = $1
    WHERE escrow_address = $2
    RETURNING *
  `;
  const res = await query(sql, [toDbAmount(amountWei), escrowAddress]);
  return rowToEscrow(res.rows[0]);
}

/**
 * Set the status message id (Discord embed message) for the escrow.
 * @param {string} escrowAddress
 * @param {string|null} statusMessageId
 */
export async function setStatusMessageId(escrowAddress, statusMessageId) {
  return setEscrowDiscordContext(escrowAddress, { statusMessageId });
}

/**
 * Fetch a single escrow by address.
 * @param {string} escrowAddress
 * @returns {Promise<object|null>}
 */
export async function getEscrowByAddress(escrowAddress) {
  const res = await query(
    `SELECT * FROM escrows WHERE escrow_address = $1 LIMIT 1`,
    [escrowAddress],
  );
  if (res.rowCount === 0) return null;
  return rowToEscrow(res.rows[0]);
}

/**
 * List escrows for a given thread (most recent first).
 * @param {string} threadId
 * @param {number} [limit=50]
 */
export async function listEscrowsByThread(threadId, limit = 50) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const res = await query(
    `
    SELECT * FROM escrows
    WHERE thread_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,
    [threadId, lim],
  );
  return res.rows.map(rowToEscrow);
}

/**
 * List recent escrows across all threads.
 * @param {number} [limit=50]
 */
export async function listRecentEscrows(limit = 50) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const res = await query(
    `
    SELECT * FROM escrows
    ORDER BY created_at DESC
    LIMIT $1
  `,
    [lim],
  );
  return res.rows.map(rowToEscrow);
}

/**
 * Convenience: record a Funded event update (status + amount).
 * @param {string} escrowAddress
 * @param {{ amountWei?: string|number|bigint|null, statusText?: string|null }} [extra]
 */
export async function markFunded(escrowAddress, extra = {}) {
  return setEscrowStatus(escrowAddress, {
    status: ESCROW_STATUS.Funded,
    amountWei: extra.amountWei ?? null,
    statusText: extra.statusText ?? statusLabel(ESCROW_STATUS.Funded),
  });
}

/**
 * Convenience: record a Delivered event update (status).
 * @param {string} escrowAddress
 * @param {{ statusText?: string|null }} [extra]
 */
export async function markDelivered(escrowAddress, extra = {}) {
  return setEscrowStatus(escrowAddress, {
    status: ESCROW_STATUS.Delivered,
    statusText: extra.statusText ?? statusLabel(ESCROW_STATUS.Delivered),
  });
}

/**
 * Convenience: record a Completed event update (status).
 * @param {string} escrowAddress
 * @param {{ statusText?: string|null }} [extra]
 */
export async function markCompleted(escrowAddress, extra = {}) {
  return setEscrowStatus(escrowAddress, {
    status: ESCROW_STATUS.Completed,
    statusText: extra.statusText ?? statusLabel(ESCROW_STATUS.Completed),
  });
}

/**
 * Convenience: record a Cancelled event update (status).
 * @param {string} escrowAddress
 * @param {{ statusText?: string|null }} [extra]
 */
export async function markCancelled(escrowAddress, extra = {}) {
  return setEscrowStatus(escrowAddress, {
    status: ESCROW_STATUS.Cancelled,
    statusText: extra.statusText ?? statusLabel(ESCROW_STATUS.Cancelled),
  });
}

/**
 * Convenience: record a Disputed event update (status).
 * @param {string} escrowAddress
 * @param {{ statusText?: string|null }} [extra]
 */
export async function markDisputed(escrowAddress, extra = {}) {
  return setEscrowStatus(escrowAddress, {
    status: ESCROW_STATUS.Disputed,
    statusText: extra.statusText ?? statusLabel(ESCROW_STATUS.Disputed),
  });
}

/**
 * Amis (manager + tradeId) helpers
 */

/**
 * Upsert an escrow record keyed by (manager_address, trade_id).
 * Requires a unique index on (manager_address, trade_id).
 * @param {object} escrow
 * @returns {Promise<object>}
 */
export async function upsertEscrowByManagerTrade(escrow) {
  if (!escrow || !escrow.managerAddress || escrow.tradeId == null) {
    throw new Error(
      "upsertEscrowByManagerTrade: 'managerAddress' and 'tradeId' are required",
    );
  }

  const columns = [
    "manager_address",
    "trade_id",
    "factory_tx_hash",
    "channel_id",
    "thread_id",
    "status_message_id",
    "creator_user_id",
    "buyer_discord_id",
    "seller_discord_id",
    "buyer_address",
    "seller_address",
    "amount_wei",
    "status",
    "status_text",
  ];
  const values = [
    escrow.managerAddress,
    String(escrow.tradeId),
    escrow.factoryTxHash ?? null,
    escrow.channelId ?? null,
    escrow.threadId ?? null,
    escrow.statusMessageId ?? null,
    escrow.creatorUserId ?? null,
    escrow.buyerDiscordId ?? null,
    escrow.sellerDiscordId ?? null,
    escrow.buyerAddress ?? null,
    escrow.sellerAddress ?? null,
    toDbAmount(escrow.amountWei),
    escrow.status !== undefined && escrow.status !== null
      ? Number(escrow.status)
      : null,
    escrow.statusText ?? null,
  ];
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "manager_address" && c !== "trade_id")
    .map((c) => `${c}=EXCLUDED.${c}`)
    .join(", ");

  const sql = `
    INSERT INTO escrows (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (manager_address, trade_id)
      WHERE manager_address IS NOT NULL AND trade_id IS NOT NULL
      DO UPDATE SET
      ${updates}
    RETURNING *
  `;

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Create a new Amis trade record right after createTrade.
 * If it exists, merges provided fields.
 *
 * @param {object} params
 * @param {string} params.managerAddress
 * @param {string|number|bigint} params.tradeId
 * @param {string} [params.channelId]
 * @param {string} [params.threadId]
 * @param {string} [params.statusMessageId]
 * @param {string} [params.creatorUserId]
 * @param {string} [params.buyerDiscordId]
 * @param {string} [params.sellerDiscordId]
 * @param {string} [params.buyerAddress]
 * @param {string} [params.sellerAddress]
 * @returns {Promise<object>}
 */
export async function recordAmisTradeCreation(params) {
  const payload = {
    managerAddress: params.managerAddress,
    tradeId: params.tradeId != null ? String(params.tradeId) : null,
    factoryTxHash: params.factoryTxHash ?? null,
    channelId: params.channelId ?? null,
    threadId: params.threadId ?? null,
    statusMessageId: params.statusMessageId ?? null,
    creatorUserId: params.creatorUserId ?? null,
    buyerDiscordId: params.buyerDiscordId ?? null,
    sellerDiscordId: params.sellerDiscordId ?? null,
    buyerAddress: params.buyerAddress ?? null,
    sellerAddress: params.sellerAddress ?? null,
    amountWei: null,
    status: ESCROW_STATUS.Created,
    statusText: statusLabel(ESCROW_STATUS.Created),
  };
  return upsertEscrowByManagerTrade(payload);
}

/**
 * Update status/amount/status_text for an Amis trade.
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @param {{ status?: number|bigint|null, amountWei?: string|number|bigint|null, statusText?: string|null }} patch
 */
export async function setEscrowStatusByManagerTrade(
  managerAddress,
  tradeId,
  patch = {},
) {
  if (!managerAddress)
    throw new Error("setEscrowStatusByManagerTrade: managerAddress required");
  if (tradeId === null || tradeId === undefined)
    throw new Error("setEscrowStatusByManagerTrade: tradeId required");

  const fields = [];
  const values = [];
  let idx = 1;

  if (patch.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(patch.status !== null ? Number(patch.status) : null);
  }
  if (patch.amountWei !== undefined) {
    fields.push(`amount_wei = $${idx++}`);
    values.push(toDbAmount(patch.amountWei));
  }
  if (patch.statusText !== undefined) {
    fields.push(`status_text = $${idx++}`);
    values.push(patch.statusText);
  }
  if (
    patch.status !== undefined &&
    patch.status !== null &&
    patch.statusText === undefined
  ) {
    fields.push(`status_text = $${idx++}`);
    values.push(statusLabel(patch.status));
  }

  if (fields.length === 0)
    return getEscrowByManagerTrade(managerAddress, tradeId);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE manager_address = $${idx} AND trade_id = $${idx + 1}
    RETURNING *
  `;
  values.push(managerAddress, String(tradeId));

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Update Discord context by (manager, tradeId).
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @param {{ channelId?: string|null, threadId?: string|null, statusMessageId?: string|null }} ctx
 */
export async function setEscrowDiscordContextByManagerTrade(
  managerAddress,
  tradeId,
  ctx = {},
) {
  if (!managerAddress)
    throw new Error(
      "setEscrowDiscordContextByManagerTrade: managerAddress required",
    );
  if (tradeId === null || tradeId === undefined)
    throw new Error("setEscrowDiscordContextByManagerTrade: tradeId required");

  const fields = [];
  const values = [];
  let i = 1;

  if (ctx.channelId !== undefined) {
    fields.push(`channel_id = $${i++}`);
    values.push(ctx.channelId);
  }
  if (ctx.threadId !== undefined) {
    fields.push(`thread_id = $${i++}`);
    values.push(ctx.threadId);
  }
  if (ctx.statusMessageId !== undefined) {
    fields.push(`status_message_id = $${i++}`);
    values.push(ctx.statusMessageId);
  }

  if (fields.length === 0)
    return getEscrowByManagerTrade(managerAddress, tradeId);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE manager_address = $${i} AND trade_id = $${i + 1}
    RETURNING *
  `;
  values.push(managerAddress, String(tradeId));

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Update parties by (manager, tradeId).
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @param {{ buyerDiscordId?: string|null, sellerDiscordId?: string|null, buyerAddress?: string|null, sellerAddress?: string|null }} patch
 */
export async function setEscrowPartiesByManagerTrade(
  managerAddress,
  tradeId,
  patch = {},
) {
  if (!managerAddress)
    throw new Error("setEscrowPartiesByManagerTrade: managerAddress required");
  if (tradeId === null || tradeId === undefined)
    throw new Error("setEscrowPartiesByManagerTrade: tradeId required");
  const fields = [];
  const values = [];
  let i = 1;

  if (patch.buyerDiscordId !== undefined) {
    fields.push(`buyer_discord_id = $${i++}`);
    values.push(patch.buyerDiscordId);
  }
  if (patch.sellerDiscordId !== undefined) {
    fields.push(`seller_discord_id = $${i++}`);
    values.push(patch.sellerDiscordId);
  }
  if (patch.buyerAddress !== undefined) {
    fields.push(`buyer_address = $${i++}`);
    values.push(patch.buyerAddress);
  }
  if (patch.sellerAddress !== undefined) {
    fields.push(`seller_address = $${i++}`);
    values.push(patch.sellerAddress);
  }

  if (fields.length === 0)
    return getEscrowByManagerTrade(managerAddress, tradeId);

  const sql = `
    UPDATE escrows
    SET ${fields.join(", ")}
    WHERE manager_address = $${i} AND trade_id = $${i + 1}
    RETURNING *
  `;
  values.push(managerAddress, String(tradeId));

  const res = await query(sql, values);
  return rowToEscrow(res.rows[0]);
}

/**
 * Set amount_wei by (manager, tradeId).
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @param {bigint|string|number|null} amountWei
 */
export async function setEscrowAmountByManagerTrade(
  managerAddress,
  tradeId,
  amountWei,
) {
  if (!managerAddress)
    throw new Error("setEscrowAmountByManagerTrade: managerAddress required");
  if (tradeId === null || tradeId === undefined)
    throw new Error("setEscrowAmountByManagerTrade: tradeId required");
  const sql = `
    UPDATE escrows
    SET amount_wei = $1
    WHERE manager_address = $2 AND trade_id = $3
    RETURNING *
  `;
  const res = await query(sql, [
    toDbAmount(amountWei),
    managerAddress,
    String(tradeId),
  ]);
  return rowToEscrow(res.rows[0]);
}
/**
 * Convenience to set status message id by (manager, tradeId).
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @param {string|null} statusMessageId
 */
export async function setStatusMessageIdByManagerTrade(
  managerAddress,
  tradeId,
  statusMessageId,
) {
  return setEscrowDiscordContextByManagerTrade(managerAddress, tradeId, {
    statusMessageId,
  });
}

/**
 * Fetch a single escrow by (manager, tradeId).
 * @param {string} managerAddress
 * @param {string|number|bigint} tradeId
 * @returns {Promise<object|null>}
 */
export async function getEscrowByManagerTrade(managerAddress, tradeId) {
  const res = await query(
    `SELECT * FROM escrows WHERE manager_address = $1 AND trade_id = $2 LIMIT 1`,
    [managerAddress, String(tradeId)],
  );
  if (res.rowCount === 0) return null;
  return rowToEscrow(res.rows[0]);
}

export default {
  ESCROW_STATUS,
  statusLabel,
  upsertEscrow,
  recordEscrowCreation,
  setEscrowStatus,
  setEscrowDiscordContext,
  setEscrowParties,
  setEscrowAmount,
  setStatusMessageId,
  getEscrowByAddress,
  listEscrowsByThread,
  listRecentEscrows,
  markFunded,
  markDelivered,
  markCompleted,
  markCancelled,
  markDisputed,
  // Amis (manager + tradeId)
  upsertEscrowByManagerTrade,
  recordAmisTradeCreation,
  setEscrowStatusByManagerTrade,
  setEscrowDiscordContextByManagerTrade,
  setEscrowPartiesByManagerTrade,
  setEscrowAmountByManagerTrade,
  setStatusMessageIdByManagerTrade,
  getEscrowByManagerTrade,
};
