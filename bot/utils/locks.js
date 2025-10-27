/**
 * Lightweight in-memory locks and cooldowns for action rate limiting.
 *
 * IMPORTANT:
 * - This is process-local memory. If your app restarts or runs multiple dynos,
 *   these limits will not synchronize across processes. For distributed locks,
 *   use a shared store (e.g., Redis, Postgres advisory locks).
 * - Keep TTLs/cooldowns short and idempotent actions safe.
 *
 * Typical usage in Discord handlers:
 *   import { withLock, withCooldown, keyFor } from "./locks.js";
 *
 *   // Prevent double-clicks on a specific action for a single thread/escrow
 *   const key = keyFor("approve_release", escrowAddress);
 *   const result = await withLock(key, 10_000, async () => {
 *     // perform the on-chain tx
 *   });
 *   if (!result.ok) {
 *     return interaction.reply({
 *       content: `Action is already in progress. Try again in ${Math.ceil(result.remainingMs/1000)}s.`,
 *       flags: MessageFlags.Ephemeral,
 *     });
 *   }
 *
 *   // Add a short cooldown after a successful action to prevent accidental re-trigger
 *   setCooldown(key, 5_000);
 *
 * Exports:
 * - tryAcquireLock(key, ttlMs) -> { ok, token?, expiresAt?, remainingMs?, reason? }
 * - releaseLock(key, token) -> boolean
 * - withLock(key, ttlMs, fn) -> { ok, value?, error?, remainingMs? }
 * - setCooldown(key, cooldownMs) -> number (nextAllowedAt)
 * - getRemainingCooldown(key) -> number (ms)
 * - checkCooldown(key) -> { ok, remainingMs }
 * - withCooldown(key, cooldownMs, fn) -> { ok, value?, error?, remainingMs? }
 * - keyFor(...parts) -> string (utility to build stable keys)
 * - stats() -> { locks, cooldowns }
 */

const locks = new Map(); // key -> { token, expiresAt }
const cooldowns = new Map(); // key -> nextAllowedAt (ms)
let lastCleanup = 0;

/**
 * Internal now helper.
 * @returns {number} epoch ms
 */
function nowMs() {
  return Date.now();
}

/**
 * Simple token generator (sufficient for in-process locking).
 * @returns {string}
 */
function token() {
  return `${Math.random().toString(36).slice(2)}_${nowMs()}`;
}

/**
 * Build a stable namespaced key for a given action and identifiers.
 * Example: keyFor("approve_release", threadId, escrowAddress)
 * @param  {...string} parts
 * @returns {string}
 */
export function keyFor(...parts) {
  return parts.map(String).join(":").toLowerCase();
}

/**
 * Cleanup expired locks and finished cooldowns every ~5 seconds (lazy).
 */
function maybeCleanup() {
  const t = nowMs();
  if (t - lastCleanup < 5_000) return;
  lastCleanup = t;

  // Locks
  for (const [k, v] of locks) {
    if (!v || typeof v.expiresAt !== "number" || v.expiresAt <= t) {
      locks.delete(k);
    }
  }
  // Cooldowns
  for (const [k, next] of cooldowns) {
    if (typeof next !== "number" || next <= t) {
      cooldowns.delete(k);
    }
  }
}

/**
 * Attempt to acquire a lock for a key.
 * @param {string} key
 * @param {number} ttlMs
 * @returns {{ ok: true, token: string, expiresAt: number } | { ok: false, remainingMs: number, reason: string }}
 */
export function tryAcquireLock(key, ttlMs = 10_000) {
  maybeCleanup();
  const t = nowMs();
  const current = locks.get(key);

  if (
    current &&
    typeof current.expiresAt === "number" &&
    current.expiresAt > t
  ) {
    const remainingMs = current.expiresAt - t;
    return { ok: false, remainingMs, reason: "locked" };
  }

  const tok = token();
  locks.set(key, { token: tok, expiresAt: t + Math.max(1, ttlMs) });
  return { ok: true, token: tok, expiresAt: t + ttlMs };
}

/**
 * Release a lock if owned by the provided token.
 * @param {string} key
 * @param {string} tok
 * @returns {boolean} true if released
 */
export function releaseLock(key, tok) {
  const current = locks.get(key);
  if (!current) return false;
  if (current.token !== tok) return false;
  locks.delete(key);
  return true;
}

/**
 * Run a function while holding a lock for the given key.
 * Automatically releases the lock when done.
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<{ ok: true, value: T } | { ok: false, error?: any, remainingMs?: number }>}
 */
export async function withLock(key, ttlMs, fn) {
  const acquired = tryAcquireLock(key, ttlMs);
  if (!acquired.ok) {
    return { ok: false, remainingMs: acquired.remainingMs };
  }
  const tok = acquired.token;
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  } finally {
    releaseLock(key, tok);
  }
}

/**
 * Place a cooldown on a key (no actions allowed until cooldown is over).
 * @param {string} key
 * @param {number} cooldownMs
 * @returns {number} nextAllowedAt (epoch ms)
 */
export function setCooldown(key, cooldownMs) {
  maybeCleanup();
  const next = nowMs() + Math.max(1, cooldownMs);
  cooldowns.set(key, next);
  return next;
}

/**
 * Get remaining cooldown time for a key.
 * @param {string} key
 * @returns {number} remaining ms (0 if none)
 */
export function getRemainingCooldown(key) {
  maybeCleanup();
  const next = cooldowns.get(key);
  if (typeof next !== "number") return 0;
  const rem = next - nowMs();
  return rem > 0 ? rem : 0;
}

/**
 * Check if a key is not cooling down.
 * @param {string} key
 * @returns {{ ok: boolean, remainingMs: number }}
 */
export function checkCooldown(key) {
  const remainingMs = getRemainingCooldown(key);
  return { ok: remainingMs <= 0, remainingMs };
}

/**
 * Execute a function only if not cooling down; otherwise return remaining time.
 * @template T
 * @param {string} key
 * @param {number} cooldownMs
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<{ ok: true, value: T } | { ok: false, remainingMs: number }>}
 */
export async function withCooldown(key, cooldownMs, fn) {
  const check = checkCooldown(key);
  if (!check.ok) {
    return { ok: false, remainingMs: check.remainingMs };
  }
  setCooldown(key, cooldownMs);
  try {
    const value = await fn();
    return { ok: true, value };
  } catch {
    // Optionally: clear cooldown on error (policy-dependent).
    // For now, keep cooldown to avoid spamming.
    return { ok: false, remainingMs: getRemainingCooldown(key) };
  }
}

/**
 * Combined helper: apply a lock, run fn, then start a cooldown.
 * Useful for one-click actions that should not overlap and should not repeat immediately.
 * @template T
 * @param {string} key
 * @param {number} lockTtlMs
 * @param {number} cooldownMs
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<{ ok: true, value: T } | { ok: false, error?: any, remainingMs?: number, reason?: string }>}
 */
export async function withLockThenCooldown(key, lockTtlMs, cooldownMs, fn) {
  const acquired = tryAcquireLock(key, lockTtlMs);
  if (!acquired.ok) {
    return { ok: false, remainingMs: acquired.remainingMs, reason: "locked" };
  }
  const tok = acquired.token;

  try {
    const value = await fn();
    // On success, set a cooldown
    setCooldown(key, cooldownMs);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  } finally {
    releaseLock(key, tok);
  }
}

/**
 * Debugging/observability convenience.
 * @returns {{ locks: number, cooldowns: number }}
 */
export function stats() {
  maybeCleanup();
  return {
    locks: locks.size,
    cooldowns: cooldowns.size,
  };
}

/**
 * Export nowMs for external timestamp logic if needed.
 */
export { nowMs };
