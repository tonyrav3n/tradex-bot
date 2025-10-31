-- Migration: Add price_eth_at_creation to flows
-- Purpose:
--   Store the ETH amount equivalent at the moment of trade creation.
--   This value is intended to be "pinned" (not recalculated later), so
--   that subsequent prompts and displays remain consistent even if the
--   market price changes.
--
-- Notes:
-- - We use NUMERIC(38,18) to handle precise ETH fractional amounts.
-- - Backfilling from price_usd is intentionally not performed here since it
--   would require an external FX rate. The application should set this value
--   when creating the trade.
--
-- Roll-forward:
ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS price_eth_at_creation NUMERIC(38,18) NULL;

-- Roll-back (manual):
-- ALTER TABLE flows DROP COLUMN IF EXISTS price_eth_at_creation;
