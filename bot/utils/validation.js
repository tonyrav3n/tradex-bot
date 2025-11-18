/**
 * Validation utilities for user input
 *
 * Provides functions to normalize and validate:
 * - USD amounts (with minimum thresholds and format validation)
 * - Future: Ethereum addresses, Discord user IDs, etc.
 *
 * @module utils/validation
 */

/**
 * Normalize a USD amount input.
 *
 * Accepts formats like:
 * - "$10", "$10.5", "10", "10.5", "1,234.56"
 * - With or without whitespace
 *
 * Returns a normalized string with two decimals for consistency.
 * Enforces a minimum trade amount of $5.00.
 *
 * @param {string|number} input - Raw user input for USD amount
 * @returns {{ ok: true, value: string, number: number } | { ok: false, error: string }}
 *
 * @example
 * normalizeUsdAmount("$10.50")  // { ok: true, value: "10.50", number: 10.5 }
 * normalizeUsdAmount("1,234")   // { ok: true, value: "1234.00", number: 1234 }
 * normalizeUsdAmount("3")       // { ok: false, error: "Minimum trade amount is $5.00" }
 * normalizeUsdAmount("abc")     // { ok: false, error: "Enter a valid USD amount..." }
 */
export function normalizeUsdAmount(input) {
  if (input === undefined || input === null || input === '') {
    return { ok: false, error: 'Enter a USD amount.' };
  }

  let raw = String(input).trim();

  // Remove spaces, optional leading '$', and thousands separators
  raw = raw.replace(/\s+/g, '');
  if (raw.startsWith('$')) {
    raw = raw.slice(1);
  }
  raw = raw.replace(/,/g, '');

  // Accept digits with optional decimal part; allow trailing dot (e.g., "10.")
  if (!/^\d+(\.\d*)?$/.test(raw)) {
    return {
      ok: false,
      error: 'Enter a valid USD amount, e.g. 10, 10.5, $10, $10.50',
    };
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, error: 'Enter a valid USD amount.' };
  }

  if (num < 5) {
    return { ok: false, error: 'Minimum trade amount is $5.00' };
  }

  // Normalize to 2 decimals for consistency
  const value = num.toFixed(2);
  return { ok: true, value, number: num };
}

/**
 * Throwing variant of normalizeUsdAmount.
 *
 * Use this when you want exceptions instead of result objects.
 *
 * @param {string|number} input - Raw user input for USD amount
 * @returns {string} Normalized value with two decimals (e.g., "10.50")
 * @throws {Error} With a user-friendly message if validation fails
 *
 * @example
 * try {
 *   const price = requireUsdAmount(userInput);
 *   console.log(`Valid price: $${price}`);
 * } catch (error) {
 *   console.error(`Invalid input: ${error.message}`);
 * }
 */
export function requireUsdAmount(input) {
  const res = normalizeUsdAmount(input);
  if (!res.ok) {
    throw new Error(res.error || 'Enter a valid USD amount.');
  }
  return res.value;
}
