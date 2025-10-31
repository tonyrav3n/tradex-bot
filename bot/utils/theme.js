/**
 * Shared theme constants for embed colors and status-to-color mappings.
 *
 * Color palette:
 * - Verified Green: #33D17A
 * - Alert Red:      #ED4245
 * - Neutral Grey:   #2F3136
 * - Blurple (Blue): #5865F2  (Discord brand blue, matches Primary button)
 *
 * Escrow status embed color rules (to match button intent):
 * - Created   (awaiting buyer to fund): Green (no action button)
 * - Funded    (awaiting seller to deliver): Blue (Primary button = blue)
 * - Delivered (awaiting buyer to approve & release): Green (Success button = green)
 * - Completed: Neutral Grey
 * - Cancelled: Alert Red
 * - Disputed:  Alert Red
 *
 * Note: This module purposefully avoids importing other project files to keep it independent.
 * Status can be provided as a number (enum 0..5) or string ("created" | "funded" | ...).
 */

export const COLORS = Object.freeze({
  VERIFIED_GREEN: 0x33d17a,
  ALERT_RED: 0xed4245,
  NEUTRAL_GREY: 0x2f3136,
  BLURPLE: 0x5865f2, // Discord brand blue, matches ButtonStyle.Primary
});

/**
 * Normalize a status input to a lowercase string label.
 * Accepts numeric enum values or strings.
 *
 * Numeric expectation (for reference, not imported):
 * 0: Created, 1: Funded, 2: Delivered, 3: Completed, 4: Cancelled, 5: Disputed
 */
function normalizeStatus(status) {
  if (typeof status === "number") {
    switch (Number(status)) {
      case 0:
        return "created";
      case 1:
        return "funded";
      case 2:
        return "delivered";
      case 3:
        return "completed";
      case 4:
        return "cancelled";
      case 5:
        return "disputed";
      default:
        return "unknown";
    }
  }
  if (typeof status === "string") {
    return status.trim().toLowerCase();
  }
  return "unknown";
}

/**
 * Map an escrow status (number or string) to the embed color that should match
 * the corresponding button intent for that state.
 *
 * - created   -> green (awaiting buyer to fund; no action button shown)
 * - funded    -> blue  (awaiting seller to deliver; "Mark delivered" button is Primary/blue)
 * - delivered -> green (awaiting buyer to approve & release; Success/green)
 * - completed -> neutral grey
 * - cancelled -> alert red
 * - disputed  -> alert red
 * - default/unknown -> neutral grey
 *
 * @param {number|string} status
 * @returns {number} Discord embed color integer
 */
export function escrowEmbedColorForStatus(status) {
  switch (normalizeStatus(status)) {
    case "created":
      return COLORS.VERIFIED_GREEN;
    case "funded":
      return COLORS.BLURPLE;
    case "delivered":
      return COLORS.VERIFIED_GREEN;
    case "completed":
      return COLORS.NEUTRAL_GREY;
    case "cancelled":
    case "canceled": // alias
      return COLORS.ALERT_RED;
    case "disputed":
      return COLORS.ALERT_RED;
    default:
      return COLORS.NEUTRAL_GREY;
  }
}

/**
 * Convenience: primary theme export.
 */
export const THEME = Object.freeze({
  COLORS,
  escrowEmbedColorForStatus,
});
