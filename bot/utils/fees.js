/**
 * Fee math helpers for TradeNest (buyer 2.5% + seller 2.5%) and related utilities.
 *
 * This module centralizes the fee calculations used by the Discord bot UI so that:
 * - Buyer totals and seller payouts are consistent everywhere
 * - Split of fees between bot and protocol/receiver matches the contract logic
 * - Pre-fund quotes and release breakdowns can be generated easily
 * - Release timeout countdown can be computed for banners and reminders
 *
 * Conventions:
 * - "base" means the escrowed amount that the contract stores in `amount` (post buyer fee).
 * - Buyer pays base × (1 + FEE_BPS/10_000).
 * - Seller receives base × (1 - FEE_BPS/10_000) at release (before gas).
 *
 * Precision:
 * - BigInt helpers operate in wei and mirror Solidity's floor division semantics.
 * - Number helpers operate in ETH (floating point) and are intended for UI display only.
 *
 * EIP-681 Payment Links:
 * - Basic format: `ethereum:<address>?value=<wei>`
 * - Optional chain id: `ethereum:<address>@<chainId>?value=<wei>`
 *   Not all wallets support @chainId; the simple form without @ is the most broadly supported.
 */

/* ===========================
   Constants
   =========================== */

export const BPS_SCALE_BI = 10_000n; // basis points scale for BigInt math
export const FEE_BPS_BI = 250n; // 2.5% fee in basis points (per side)
export const TOTAL_FEE_BPS_BI = 500n; // 5.0% total (buyer + seller)
export const BOT_SHARE_BPS_BI = 100n; // bot gets 100/500 = 20% of each side's fee (i.e., 0.5% of base)

export const DEFAULT_RELEASE_TIMEOUT_SECONDS = 24 * 60 * 60; // 1 day

// Number counterparts (ETH)
export const BPS_SCALE = 10_000;
export const FEE_BPS = 250;
export const TOTAL_FEE_BPS = 500;
export const BOT_SHARE_BPS = 100;

/* ===========================
   Internal helpers
   =========================== */

/**
 * Integer floor division: (x * num) / den, in BigInt.
 * Mirrors Solidity's truncating integer division.
 */
function mulDivFloor(x, num, den) {
  return (x * num) / den;
}

/* ===========================
   BigInt (wei) helpers
   =========================== */

/**
 * Given a base escrow amount (wei), compute the buyer's total payment (wei),
 * which includes the 2.5% buyer fee.
 */
export function buyerTotalWeiFromBaseWei(baseWei) {
  return mulDivFloor(baseWei, BPS_SCALE_BI + FEE_BPS_BI, BPS_SCALE_BI);
}

/**
 * Given a buyer's total payment (wei), compute the base escrow amount (wei)
 * that the contract will store, inverting the 2.5% buyer fee.
 */
export function baseWeiFromBuyerTotalWei(totalWei) {
  return mulDivFloor(totalWei, BPS_SCALE_BI, BPS_SCALE_BI + FEE_BPS_BI);
}

/**
 * Buyer fee from base amount (wei).
 */
export function buyerFeeWeiFromBaseWei(baseWei) {
  return mulDivFloor(baseWei, FEE_BPS_BI, BPS_SCALE_BI);
}

/**
 * Seller fee from base amount (wei).
 */
export function sellerFeeWeiFromBaseWei(baseWei) {
  return mulDivFloor(baseWei, FEE_BPS_BI, BPS_SCALE_BI);
}

/**
 * Seller payout (wei) at release, i.e., base minus seller fee.
 */
export function sellerPayoutWeiFromBaseWei(baseWei) {
  const fee = sellerFeeWeiFromBaseWei(baseWei);
  return baseWei - fee;
}

/**
 * Split a fee amount (wei) between bot and receiver/treasury according to
 * BOT_SHARE_BPS / TOTAL_FEE_BPS (e.g., 100/500 = 20% to bot).
 */
export function splitFeeWei(feeWei) {
  const botFeeWei = mulDivFloor(feeWei, BOT_SHARE_BPS_BI, TOTAL_FEE_BPS_BI);
  const receiverFeeWei = feeWei - botFeeWei;
  return { botFeeWei, receiverFeeWei };
}

/**
 * Aggregate fee splits for an escrow given base amount (wei):
 * - Buyer fee (2.5% of base) split to bot/receiver
 * - Seller fee (2.5% of base) split to bot/receiver
 */
export function aggregateFeesWeiFromBaseWei(baseWei) {
  const buyerFeeWei = buyerFeeWeiFromBaseWei(baseWei);
  const sellerFeeWei = sellerFeeWeiFromBaseWei(baseWei);

  const buyerSplit = splitFeeWei(buyerFeeWei);
  const sellerSplit = splitFeeWei(sellerFeeWei);

  const botFeeTotalWei = buyerSplit.botFeeWei + sellerSplit.botFeeWei;
  const receiverFeeTotalWei =
    buyerSplit.receiverFeeWei + sellerSplit.receiverFeeWei;

  return {
    buyerFeeWei,
    sellerFeeWei,
    totalFeesWei: buyerFeeWei + sellerFeeWei,
    botFeeWei: botFeeTotalWei,
    receiverFeeWei: receiverFeeTotalWei,
  };
}

/**
 * Full breakdown for UI from base amount (wei).
 */
export function buildWeiBreakdownFromBase(baseWei) {
  const buyerTotalWei = buyerTotalWeiFromBaseWei(baseWei);
  const buyerFeeWei = buyerFeeWeiFromBaseWei(baseWei);
  const sellerFeeWei = sellerFeeWeiFromBaseWei(baseWei);
  const payoutWei = sellerPayoutWeiFromBaseWei(baseWei);
  const splits = aggregateFeesWeiFromBaseWei(baseWei);

  return {
    baseWei,
    buyer: {
      feeWei: buyerFeeWei,
      totalWei: buyerTotalWei,
    },
    seller: {
      feeWei: sellerFeeWei,
      payoutWei,
    },
    fees: {
      totalWei: splits.totalFeesWei,
      botFeeWei: splits.botFeeWei,
      receiverFeeWei: splits.receiverFeeWei,
    },
  };
}

/* ===========================
   Number (ETH) helpers for display
   =========================== */

/**
 * Compute buyer total (ETH) given base (ETH).
 */
export function buyerTotalEthFromBaseEth(baseEth) {
  return (Number(baseEth) * (BPS_SCALE + FEE_BPS)) / BPS_SCALE;
}

/**
 * Compute base (ETH) from buyer total (ETH).
 */
export function baseEthFromBuyerTotalEth(totalEth) {
  return (Number(totalEth) * BPS_SCALE) / (BPS_SCALE + FEE_BPS);
}

/**
 * Buyer fee (ETH) from base (ETH).
 */
export function buyerFeeEthFromBaseEth(baseEth) {
  return (Number(baseEth) * FEE_BPS) / BPS_SCALE;
}

/**
 * Seller fee (ETH) from base (ETH).
 */
export function sellerFeeEthFromBaseEth(baseEth) {
  return (Number(baseEth) * FEE_BPS) / BPS_SCALE;
}

/**
 * Seller payout (ETH) at release from base (ETH).
 */
export function sellerPayoutEthFromBaseEth(baseEth) {
  return Number(baseEth) - sellerFeeEthFromBaseEth(baseEth);
}

/**
 * Split a fee (ETH) into bot/protocol using BOT_SHARE_BPS / TOTAL_FEE_BPS.
 * Intended for display. For settlement, use the wei (BigInt) equivalent.
 */
export function splitFeeEth(feeEth) {
  const botFeeEth = (Number(feeEth) * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
  const receiverFeeEth = Number(feeEth) - botFeeEth;
  return { botFeeEth, receiverFeeEth };
}

/**
 * Full ETH (number) breakdown for UI given base (ETH).
 */
export function buildEthBreakdownFromBase(baseEth) {
  const buyerFeeEth = buyerFeeEthFromBaseEth(baseEth);
  const sellerFeeEth = sellerFeeEthFromBaseEth(baseEth);
  const buyerTotalEth = buyerTotalEthFromBaseEth(baseEth);
  const payoutEth = sellerPayoutEthFromBaseEth(baseEth);

  const buyerSplit = splitFeeEth(buyerFeeEth);
  const sellerSplit = splitFeeEth(sellerFeeEth);

  return {
    baseEth: Number(baseEth),
    buyer: {
      feeEth: buyerFeeEth,
      totalEth: buyerTotalEth,
    },
    seller: {
      feeEth: sellerFeeEth,
      payoutEth,
    },
    fees: {
      totalEth: buyerFeeEth + sellerFeeEth,
      botFeeEth: buyerSplit.botFeeEth + sellerSplit.botFeeEth,
      receiverFeeEth: buyerSplit.receiverFeeEth + sellerSplit.receiverFeeEth,
    },
  };
}

/* ===========================
   Payment link (EIP-681)
   =========================== */

/**
 * Build a simple EIP-681 payment link that most wallets understand.
 * - address: 0x-prefixed hex address
 * - valueWei: BigInt or string decimal of wei (optional, but recommended)
 * - chainId: optional (e.g., 11155111 for Sepolia) — not all wallets support @chainId
 *
 * Examples:
 * - ethereum:0xAbC...123?value=1000000000000000000
 * - ethereum:0xAbC...123@11155111?value=1000000000000000000
 */
export function buildPaymentLink(address, { valueWei, chainId } = {}) {
  if (!address || typeof address !== "string") {
    throw new Error("buildPaymentLink: 'address' must be a string");
  }
  const addr = address.trim();
  const chainPart =
    chainId !== undefined && chainId !== null ? `@${String(chainId)}` : "";
  const valuePart =
    valueWei !== undefined && valueWei !== null
      ? `?value=${String(valueWei)}`
      : "";
  return `ethereum:${addr}${chainPart}${valuePart}`;
}

/* ===========================
   Release countdown helpers
   =========================== */

/**
 * Compute the release deadline (unix seconds) given the delivery timestamp
 * and the configured timeout seconds (default: 86400, i.e., 1 day).
 */
export function computeReleaseDeadline(
  deliveredAtSec,
  releaseTimeoutSec = DEFAULT_RELEASE_TIMEOUT_SECONDS,
) {
  const d = Number(deliveredAtSec || 0);
  const t = Number(releaseTimeoutSec || 0);
  return d + t;
}

/**
 * Compute seconds left until the release deadline (clamped at >= 0).
 */
export function releaseTimeLeftSeconds(
  nowSec,
  deliveredAtSec,
  releaseTimeoutSec = DEFAULT_RELEASE_TIMEOUT_SECONDS,
) {
  const deadline = computeReleaseDeadline(deliveredAtSec, releaseTimeoutSec);
  const left = Number(deadline) - Number(nowSec || 0);
  return left > 0 ? left : 0;
}

/**
 * True if the release timeout has elapsed.
 */
export function isReleaseReady(
  nowSec,
  deliveredAtSec,
  releaseTimeoutSec = DEFAULT_RELEASE_TIMEOUT_SECONDS,
) {
  return (
    releaseTimeLeftSeconds(nowSec, deliveredAtSec, releaseTimeoutSec) === 0
  );
}

/* ===========================
   Convenience: default export
   =========================== */

export default {
  // constants
  BPS_SCALE_BI,
  FEE_BPS_BI,
  TOTAL_FEE_BPS_BI,
  BOT_SHARE_BPS_BI,
  BPS_SCALE,
  FEE_BPS,
  TOTAL_FEE_BPS,
  BOT_SHARE_BPS,
  DEFAULT_RELEASE_TIMEOUT_SECONDS,

  // BigInt (wei)
  buyerTotalWeiFromBaseWei,
  baseWeiFromBuyerTotalWei,
  buyerFeeWeiFromBaseWei,
  sellerFeeWeiFromBaseWei,
  sellerPayoutWeiFromBaseWei,
  splitFeeWei,
  aggregateFeesWeiFromBaseWei,
  buildWeiBreakdownFromBase,

  // Number (ETH)
  buyerTotalEthFromBaseEth,
  baseEthFromBuyerTotalEth,
  buyerFeeEthFromBaseEth,
  sellerFeeEthFromBaseEth,
  sellerPayoutEthFromBaseEth,
  splitFeeEth,
  buildEthBreakdownFromBase,

  // Payment link
  buildPaymentLink,

  // Countdown
  computeReleaseDeadline,
  releaseTimeLeftSeconds,
  isReleaseReady,
};
