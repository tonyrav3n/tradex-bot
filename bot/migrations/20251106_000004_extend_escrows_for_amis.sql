-- 20251106_000004_extend_escrows_for_amis.sql
-- Extend escrows table to support AmisEscrowManager model (single manager + tradeId)
-- - Adds manager_address (TEXT) and trade_id (NUMERIC(78,0))
-- - Allows NULL escrow_address (deprecated, kept for backward compatibility)
-- - Adds helpful indexes, including a partial unique index on (manager_address, trade_id)
-- - Documents deprecation of escrow_address
--
-- Notes:
-- - We keep existing data intact and do not attempt to backfill manager_address/trade_id.
-- - escrow_address remains present but becomes nullable and should be considered deprecated.
-- - New records for Amis should populate (manager_address, trade_id) and leave escrow_address NULL.

BEGIN;

-- 1) Add new columns for Amis model
ALTER TABLE escrows
  ADD COLUMN IF NOT EXISTS manager_address TEXT NULL;

ALTER TABLE escrows
  ADD COLUMN IF NOT EXISTS trade_id NUMERIC(78,0) NULL;

-- 2) Deprecate escrow_address by allowing NULLs (if the column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'escrows'
      AND column_name = 'escrow_address'
  ) THEN
    -- Allow storing NULL in legacy escrow_address for Amis trades
    EXECUTE 'ALTER TABLE escrows ALTER COLUMN escrow_address DROP NOT NULL';
  END IF;
END
$$;

-- 3) Indexing for new columns
CREATE INDEX IF NOT EXISTS idx_escrows_trade_id
  ON escrows (trade_id);

CREATE INDEX IF NOT EXISTS idx_escrows_manager_address
  ON escrows (manager_address);

-- 4) Ensure uniqueness for manager_address + trade_id when both are set
--    (Partial unique index: only applies to Amis trades where both fields are non-NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_escrows_manager_trade
  ON escrows (manager_address, trade_id)
  WHERE manager_address IS NOT NULL AND trade_id IS NOT NULL;

-- 5) Documentation/comments
COMMENT ON COLUMN escrows.manager_address IS
  'Deployed AmisEscrowManager address; pairs with trade_id to uniquely identify a trade.';

COMMENT ON COLUMN escrows.trade_id IS
  'On-chain trade identifier (uint256) from AmisEscrowManager.';

COMMENT ON COLUMN escrows.escrow_address IS
  'Deprecated: legacy per-escrow contract address (NULL for Amis trades).';

COMMIT;
