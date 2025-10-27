/**
 * Role utilities for determining buyer/seller Discord IDs and checks.
 *
 * These helpers centralize the logic for resolving which user is the buyer/seller
 * for a given flow, whether roles are "locked" (explicitly saved on the flow),
 * and simple assertion helpers for permission checks in handlers.
 *
 * Conventions:
 * - A "flow" object may contain:
 *    - role: "buyer" | "seller" | undefined
 *    - counterpartyId: string | undefined
 *    - buyerDiscordId: string | undefined (locked at thread creation)
 *    - sellerDiscordId: string | undefined (locked at thread creation)
 *
 * - When locked IDs exist (buyerDiscordId/sellerDiscordId), they take precedence.
 * - Otherwise, we derive buyer/seller by looking at the caller's role and counterparty.
 */

/**
 * Normalize a Discord snowflake-ish value to a string. Returns null if empty.
 * @param {string | number | null | undefined} v
 * @returns {string | null}
 */
function toId(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Compare two Discord IDs case-sensitively after normalization.
 * @param {string | number | null | undefined} a
 * @param {string | number | null | undefined} b
 * @returns {boolean}
 */
function idEq(a, b) {
  const A = toId(a);
  const B = toId(b);
  if (A === null || B === null) return false;
  return A === B;
}

/**
 * Resolve buyer/seller IDs with precedence:
 * 1) Locked IDs on flow (buyerDiscordId/sellerDiscordId)
 * 2) Derived from caller's role + counterparty
 *
 * @param {any} flow
 * @param {string} uid - Caller/user Discord ID
 * @returns {{ buyerId: string | null, sellerId: string | null }}
 */
export function resolveLockedRoles(flow, uid) {
  const lockedBuyer = toId(flow?.buyerDiscordId);
  const lockedSeller = toId(flow?.sellerDiscordId);

  if (lockedBuyer || lockedSeller) {
    return {
      buyerId: lockedBuyer ?? null,
      sellerId: lockedSeller ?? null,
    };
  }

  // Derive from role + counterparty as a fallback
  const role = flow?.role;
  const cp = toId(flow?.counterpartyId);
  const me = toId(uid);

  if (!me) {
    return { buyerId: null, sellerId: null };
  }

  if (role === "buyer") {
    return { buyerId: me, sellerId: cp ?? null };
  }
  if (role === "seller") {
    return { buyerId: cp ?? null, sellerId: me };
  }

  // Unknown role: fallback to "caller is buyer" for symmetry, but mark as partial if no cp
  return { buyerId: me, sellerId: cp ?? null };
}

/**
 * Get the buyer's Discord ID, using locked IDs if available, otherwise derive.
 * @param {any} flow
 * @param {string} uid - Caller/user Discord ID
 * @returns {string | null}
 */
export function getBuyerId(flow, uid) {
  const lockedBuyer = toId(flow?.buyerDiscordId);
  if (lockedBuyer) return lockedBuyer;
  return resolveLockedRoles(flow, uid).buyerId;
}

/**
 * Get the seller's Discord ID, using locked IDs if available, otherwise derive.
 * @param {any} flow
 * @param {string} uid - Caller/user Discord ID
 * @returns {string | null}
 */
export function getSellerId(flow, uid) {
  const lockedSeller = toId(flow?.sellerDiscordId);
  if (lockedSeller) return lockedSeller;
  return resolveLockedRoles(flow, uid).sellerId;
}

/**
 * Check if the given user ID is the buyer for this flow.
 * @param {string} uid
 * @param {any} flow
 * @returns {boolean}
 */
export function isBuyer(uid, flow) {
  const buyerId = getBuyerId(flow, uid);
  return idEq(uid, buyerId);
}

/**
 * Check if the given user ID is the seller for this flow.
 * @param {string} uid
 * @param {any} flow
 * @returns {boolean}
 */
export function isSeller(uid, flow) {
  const sellerId = getSellerId(flow, uid);
  return idEq(uid, sellerId);
}

/**
 * Assert the caller is the buyer. Returns a simple result object for handlers to act on.
 * @param {string} uid
 * @param {any} flow
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function assertBuyer(uid, flow) {
  if (!flow) {
    return { ok: false, message: "No active trade flow found." };
  }
  if (!isBuyer(uid, flow)) {
    return { ok: false, message: "You are not the buyer for this trade." };
  }
  return { ok: true };
}

/**
 * Assert the caller is the seller. Returns a simple result object for handlers to act on.
 * @param {string} uid
 * @param {any} flow
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function assertSeller(uid, flow) {
  if (!flow) {
    return { ok: false, message: "No active trade flow found." };
  }
  if (!isSeller(uid, flow)) {
    return { ok: false, message: "You are not the seller for this trade." };
  }
  return { ok: true };
}

export default {
  resolveLockedRoles,
  getBuyerId,
  getSellerId,
  isBuyer,
  isSeller,
  assertBuyer,
  assertSeller,
};
