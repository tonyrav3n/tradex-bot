import { query } from "./db.js";

/**
 * Postgres-backed Flow Repository.
 *
 * Exposes a similar API to the old in-memory flowState:
 * - getFlow, hasFlow, startFlow, setFlow, clearFlow, resetAllFlows, dumpFlows
 * - setPrice, markBuyerAgreed, markSellerAgreed, setBuyerAddress, setSellerAddress
 * - resetAgreementState, lockDiscordParties, setThreadContextFresh
 *
 * Table (see migration):
 *   flows (
 *     user_id TEXT PRIMARY KEY,
 *     initiator_id TEXT NOT NULL,
 *     role TEXT NULL CHECK (role IN ('buyer','seller')),
 *     counterparty_id TEXT NULL,
 *     original_interaction_token TEXT NULL,
 *     description TEXT NULL,
 *     price_usd NUMERIC(18,2) NULL,
 *     buyer_agreed BOOLEAN NOT NULL DEFAULT FALSE,
 *     seller_agreed BOOLEAN NOT NULL DEFAULT FALSE,
 *     buyer_address TEXT NULL,
 *     seller_address TEXT NULL,
 *     buyer_discord_id TEXT NULL,
 *     seller_discord_id TEXT NULL,
 *     thread_id TEXT NULL,
 *     agree_message_id TEXT NULL,
 *     escrow_address TEXT NULL,
 *     escrow_status_message_id TEXT NULL,
 *     escrow_watcher_started BOOLEAN NOT NULL DEFAULT FALSE,
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   )
 */

/**
 * Convert a DB row (snake_case) into a JS flow object (camelCase).
 * @param {any} row
 */
function rowToFlow(row) {
  if (!row) return null;
  return {
    // identities
    initiatorId: row.initiator_id ?? null,
    role: row.role ?? null, // 'buyer' | 'seller' | null
    counterpartyId: row.counterparty_id ?? null,

    // interaction token
    originalInteractionToken: row.original_interaction_token ?? null,

    // content
    description: row.description ?? null,
    priceUsd:
      row.price_usd !== null && row.price_usd !== undefined
        ? String(row.price_usd)
        : null,
    priceEthAtCreation:
      row.price_eth_at_creation !== null &&
      row.price_eth_at_creation !== undefined
        ? String(row.price_eth_at_creation)
        : null,

    // agreements
    buyerAgreed: Boolean(row.buyer_agreed),
    sellerAgreed: Boolean(row.seller_agreed),

    // addresses
    buyerAddress: row.buyer_address ?? null,
    sellerAddress: row.seller_address ?? null,

    // discord ids
    buyerDiscordId: row.buyer_discord_id ?? null,
    sellerDiscordId: row.seller_discord_id ?? null,

    // thread context
    threadId: row.thread_id ?? null,
    agreeMessageId: row.agree_message_id ?? null,

    // escrow refs
    escrowAddress: row.escrow_address ?? null,
    escrowStatusMessageId: row.escrow_status_message_id ?? null,
    escrowWatcherStarted: Boolean(row.escrow_watcher_started),

    // audit
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Return a default base flow object for a given user.
 * Mirrors what startFlow used to initialize.
 * @param {string} userId
 */
function baseFlow(userId) {
  return {
    initiatorId: userId,

    role: null,
    counterpartyId: null,

    originalInteractionToken: null,

    description: null,
    priceUsd: null,
    priceEthAtCreation: null,

    buyerAgreed: false,
    sellerAgreed: false,

    buyerAddress: null,
    sellerAddress: null,

    buyerDiscordId: null,
    sellerDiscordId: null,

    threadId: null,
    agreeMessageId: null,

    escrowAddress: null,
    escrowStatusMessageId: null,
    escrowWatcherStarted: false,
  };
}

/**
 * Normalize role value for DB constraint.
 * @param {any} role
 * @returns {'buyer'|'seller'|null}
 */
function normalizeRole(role) {
  if (role === "buyer" || role === "seller") return role;
  return null;
}

/**
 * Convert a JS flow object (camelCase) into column-ordered values array.
 * Order corresponds to the 'columns' constant below.
 * @param {object} flow
 * @param {string} userId
 */
function flowToValues(flow, userId) {
  return [
    userId,
    flow.initiatorId ?? userId,
    normalizeRole(flow.role),
    flow.counterpartyId ?? null,

    flow.originalInteractionToken ?? null,

    flow.description ?? null,
    flow.priceUsd !== undefined && flow.priceUsd !== null
      ? String(flow.priceUsd)
      : null,
    flow.priceEthAtCreation !== undefined && flow.priceEthAtCreation !== null
      ? String(flow.priceEthAtCreation)
      : null,

    Boolean(flow.buyerAgreed),
    Boolean(flow.sellerAgreed),

    flow.buyerAddress ?? null,
    flow.sellerAddress ?? null,

    flow.buyerDiscordId ?? null,
    flow.sellerDiscordId ?? null,

    flow.threadId ?? null,
    flow.agreeMessageId ?? null,

    flow.escrowAddress ?? null,
    flow.escrowStatusMessageId ?? null,
    Boolean(flow.escrowWatcherStarted),
  ];
}

/**
 * Columns used for INSERT/UPSERT (order matters and matches flowToValues()).
 */
const columns = [
  "user_id",
  "initiator_id",
  "role",
  "counterparty_id",
  "original_interaction_token",
  "description",
  "price_usd",
  "price_eth_at_creation",
  "buyer_agreed",
  "seller_agreed",
  "buyer_address",
  "seller_address",
  "buyer_discord_id",
  "seller_discord_id",
  "thread_id",
  "agree_message_id",
  "escrow_address",
  "escrow_status_message_id",
  "escrow_watcher_started",
];

/**
 * Upsert a flow row by user id. Returns the saved flow.
 * @param {string} userId
 * @param {object} flow
 */
async function upsertFlow(userId, flow) {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "user_id") // PK not updated
    .map((c) => `${c}=EXCLUDED.${c}`)
    .join(", ");

  const sql = `
    INSERT INTO flows (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (user_id) DO UPDATE SET
      ${updates}
    RETURNING *
  `;

  const values = flowToValues(flow, userId);
  const res = await query(sql, values);
  return rowToFlow(res.rows[0]);
}

/**
 * Fetch a flow for a user.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getFlow(userId) {
  const res = await query(`SELECT * FROM flows WHERE user_id = $1 LIMIT 1`, [
    userId,
  ]);
  if (res.rowCount === 0) return null;
  return rowToFlow(res.rows[0]);
}

/**
 * Check if a flow exists for a user.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasFlow(userId) {
  const res = await query(`SELECT 1 FROM flows WHERE user_id = $1`, [userId]);
  return res.rowCount > 0;
}

/**
 * Start (or reset) a flow for a user with optional initial fields.
 * @param {string} userId
 * @param {object} [initial={}]
 * @returns {Promise<object>}
 */
export async function startFlow(userId, initial = {}) {
  const merged = {
    ...baseFlow(userId),
    ...initial,
  };
  return upsertFlow(userId, merged);
}

/**
 * Shallow-merge a partial update into the existing (or base) flow and persist.
 * Passing null for a field explicitly resets it to null.
 * @param {string} userId
 * @param {object} partial
 * @returns {Promise<object>}
 */
export async function setFlow(userId, partial) {
  const current = (await getFlow(userId)) ?? baseFlow(userId);
  const merged = {
    ...current,
    ...partial,
  };
  return upsertFlow(userId, merged);
}

/**
 * Clear a user's flow.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function clearFlow(userId) {
  await query(`DELETE FROM flows WHERE user_id = $1`, [userId]);
  return true;
}

/**
 * Dangerous: clears all flows.
 * @returns {Promise<boolean>}
 */
export async function resetAllFlows() {
  await query(`DELETE FROM flows`, []);
  return true;
}

/**
 * Dump recent flows for debugging/inspection.
 * @param {number} [limit=100]
 * @returns {Promise<object[]>}
 */
export async function dumpFlows(limit = 100) {
  const lim = Math.max(1, Math.min(1000, Number(limit) || 100));
  const res = await query(
    `SELECT * FROM flows ORDER BY updated_at DESC LIMIT $1`,
    [lim],
  );
  return res.rows.map(rowToFlow);
}

/**
 * Convenience helpers mirroring previous API.
 */
export async function setPrice(userId, priceUsd) {
  return setFlow(userId, { priceUsd });
}

export async function setPriceEthAtCreation(userId, priceEthAtCreation) {
  return setFlow(userId, { priceEthAtCreation });
}

export async function markBuyerAgreed(userId) {
  return setFlow(userId, { buyerAgreed: true });
}

export async function markSellerAgreed(userId) {
  return setFlow(userId, { sellerAgreed: true });
}

export async function setBuyerAddress(userId, address) {
  return setFlow(userId, { buyerAddress: address });
}

export async function setSellerAddress(userId, address) {
  return setFlow(userId, { sellerAddress: address });
}

/**
 * Reset agreement and address fields (fresh state).
 * @param {string} userId
 */
export async function resetAgreementState(userId) {
  return setFlow(userId, {
    buyerAgreed: false,
    sellerAgreed: false,
    buyerAddress: null,
    sellerAddress: null,
  });
}

/**
 * Lock buyer/seller Discord user IDs.
 * @param {string} userId
 * @param {{ buyerDiscordId?: string|null, sellerDiscordId?: string|null }} locks
 */
export async function lockDiscordParties(userId, locks = {}) {
  const { buyerDiscordId = null, sellerDiscordId = null } = locks;
  return setFlow(userId, { buyerDiscordId, sellerDiscordId });
}

/**
 * Set thread context and clear transient state to avoid stale flags when moving to a new thread.
 * @param {string} userId
 * @param {{ threadId?: string|null, agreeMessageId?: string|null }} ctx
 */
export async function setThreadContextFresh(userId, ctx = {}) {
  const { threadId = null, agreeMessageId = null } = ctx;
  return setFlow(userId, {
    threadId,
    agreeMessageId,
    buyerAgreed: false,
    sellerAgreed: false,
    buyerAddress: null,
    sellerAddress: null,
    escrowAddress: null,
    escrowStatusMessageId: null,
    escrowWatcherStarted: false,
  });
}

export default {
  getFlow,
  hasFlow,
  startFlow,
  setFlow,
  clearFlow,
  resetAllFlows,
  dumpFlows,
  setPrice,
  setPriceEthAtCreation,
  markBuyerAgreed,
  markSellerAgreed,
  setBuyerAddress,
  setSellerAddress,
  resetAgreementState,
  lockDiscordParties,
  setThreadContextFresh,
};
