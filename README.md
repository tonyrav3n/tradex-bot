# TradeNest Discord Bot – Fees and UX

This document explains the new 2.5% + 2.5% fee model, how the pre‑fund quote works, the release breakdown and countdown, and outlines the upcoming dispute feature.

## Fee model overview

- Buyer fee: 2.5% (on top)
- Seller fee: 2.5% (deducted at release)
- “Base” amount: the escrowed amount stored on-chain as `amount`. This is the agreed price net of the buyer fee.
  - If base = X, the buyer sends X × 1.025 to fund.
  - At release, the seller receives X × 0.975.
- Fee splits (as implemented on-chain):
  - Each side’s 2.5% fee is split:
    - Bot share: 0.5% of base (20% of each 2.5% fee)
    - Protocol/feeReceiver: 2.0% of base across both sides (1.5% per side)
  - Totals across both sides:
    - Bot: ~1.0% of base (0.5% buyer side + 0.5% seller side)
    - Fee receiver: ~3.0% of base
    - Seller receives: 97.5% of base
    - Buyer pays: 102.5% of base

Quick math reference:
- Buyer pays: base × 1.025
- Seller receives: base × 0.975
- Buyer fee: base × 0.025
- Seller fee: base × 0.025

## Pre‑fund quote

Purpose: Give the buyer an exact, one‑tap breakdown before funding to eliminate surprises.

How it appears:
- In the Escrow Status message while status is Created (awaiting funding), click “Get pre‑fund quote”.
- Only the buyer sees the response (ephemeral).

What the quote shows:
- Escrow amount (base): the amount that will be locked in the contract.
- Buyer fee (2.5%): computed from base.
- Total to send: base × 1.025 (in ETH).
- Escrow address: the escrow contract address to fund.
- Network name (e.g., Sepolia).
- If a USD price was provided at trade creation, the base ETH is pinned from that USD value to keep UX stable.

Behavior and accuracy:
- The base ETH number is pinned at creation time from the user’s USD input (using a price feed). If pinning wasn’t possible, a live FX rate is used.
- The contract itself enforces the fee math; the quote mirrors the on‑chain result.



## Release breakdown

Before the buyer executes “Approve & Release,” the bot shows a short breakdown:
- Base (escrowed)
- Seller fee (2.5%)
- Seller receives (base × 0.975)

After the transaction, the thread is updated to reflect completion and fee payments.

## Delivery and auto‑release countdown

Flow:
1. Seller clicks “Mark Delivered.” The contract moves to Delivered, and the bot posts:
   - A countdown banner showing when auto‑release becomes available, using Discord timestamps: both the absolute time and relative time.

2. Buyer can approve earlier via “Approve & Release.”
3. If the buyer does not act, the contract allows release after a timeout (currently 24 hours by default in the contract).
4. After the timeout, the bot (as the authorized actor) can execute auto‑release on-chain.

Notes:
- The countdown is informational and driven by the contract’s `releaseTimeout`. The bot displays it and can act after it expires.
- If the bot is offline at the moment of expiry, it will execute auto‑release when it comes back online and detects the condition (or admins can prompt it).

## Dispute feature (planned)

Goal: Allow parties to pause release and escalate for moderation/arbitration.

Proposed approach:
- UX:
  - Add “Raise Dispute” visible to either party only when the trade is in Delivered.
  - Require a short reason (modal). The bot posts a summary in the thread and notifies moderators/admins.
  - Hide “Approve & Release” while in dispute.
- On‑chain:
  - Introduce a `dispute()` function callable by the bot that sets status to Disputed.
  - Disputed status would block `approveDelivery` and `releaseAfterTimeout` until resolution.
  - Add resolution paths restricted to the bot/admin key:
    - `resolveToSeller()` (releases to seller, with fees as usual)
    - `resolveToBuyer()` (refunds buyer minus fees if desired, or fee‑free depending on policy)
  - Optionally include evidence hashes/URIs for auditability.
- Policy:
  - Define clear criteria for resolving to buyer/seller.
  - Consider fee behavior on refunds (full vs partial) and who bears arbitration costs.
  - Log disputes to a mod‑only channel and to the database.

This is not yet implemented. Let’s finalize the policy and exact on‑chain surface before coding.

## Security and safety notes

- Never post private keys, bot tokens, or API keys in public chats.
- Rotate secrets if they were ever exposed.
- Keep wallet balances minimal on operational keys; use allowlists/rule‑based keys where possible.
- Use the pinned ETH at creation to minimize price drift throughout the flow. The on‑chain result remains authoritative.

## Quick glossary

- Base amount: The escrowed amount stored in the contract (`amount`).
- Buyer total: The amount the buyer must send to fund (base × 1.025).
- Seller payout: The amount the seller receives at release (base × 0.975).
- Fee receiver (protocol): Receives the remainder of fees after the bot’s share.
- Bot share: Portion of fees routed to the bot address per contract constants.

