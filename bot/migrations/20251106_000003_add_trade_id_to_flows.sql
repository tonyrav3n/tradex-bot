-- 20251106_000003_add_trade_id_to_flows.sql
-- Add migration to add trade_id column to flows table
-- Purpose:
-- - Store on-chain trade identifier (uint256) from AmisEscrowManager in per-user flow state
-- - Facilitate lookups and UI synchronization by trade id
-- Notes:
-- - Uses NUMERIC(78,0) to safely accommodate uint256 values
-- - Adds an index for efficient querying

BEGIN;

ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS trade_id NUMERIC(78,0) NULL;

COMMENT ON COLUMN flows.trade_id IS
  'On-chain trade identifier (uint256) from AmisEscrowManager.';

CREATE INDEX IF NOT EXISTS idx_flows_trade_id
  ON flows (trade_id);

COMMIT;
