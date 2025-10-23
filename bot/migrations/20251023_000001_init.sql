-- Initial schema for flows and escrows
-- - flows: per-user interaction state for the trade creation UX
-- - escrows: on-chain escrow records tracked by the bot
--
-- Notes:
-- - We use TEXT for Discord/user/channel/thread/message IDs to avoid size/format constraints.
-- - Timestamps are in timestamptz and updated via trigger on UPDATE.
-- - Amounts are stored as numeric to support large integers (amount_wei).
-- - Status mirrors on-chain enum (0..5), but we also keep a status_text for convenience.
-- - One flow row per user_id (PRIMARY KEY) to simplify upsert semantics.

-- Ensure a general-purpose trigger to maintain updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- flows: per-user in-progress state
CREATE TABLE IF NOT EXISTS flows (
  user_id                    TEXT PRIMARY KEY,
  initiator_id               TEXT NOT NULL,
  role                       TEXT NULL CHECK (role IN ('buyer','seller')),
  counterparty_id            TEXT NULL,

  original_interaction_token TEXT NULL,

  -- Content
  description                TEXT NULL,
  price_usd                  NUMERIC(18,2) NULL,

  -- Agreement state
  buyer_agreed               BOOLEAN NOT NULL DEFAULT FALSE,
  seller_agreed              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Party addresses (EOA)
  buyer_address              TEXT NULL,
  seller_address             TEXT NULL,

  -- Discord user locks for thread membership
  buyer_discord_id           TEXT NULL,
  seller_discord_id          TEXT NULL,

  -- Discord thread + message references
  thread_id                  TEXT NULL,
  agree_message_id           TEXT NULL,

  -- Escrow tracking
  escrow_address             TEXT NULL,
  escrow_status_message_id   TEXT NULL,
  escrow_watcher_started     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_flows_counterparty ON flows (counterparty_id);
CREATE INDEX IF NOT EXISTS idx_flows_thread ON flows (thread_id);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_flows_updated_at ON flows;
CREATE TRIGGER trg_flows_updated_at
BEFORE UPDATE ON flows
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- escrows: records of on-chain escrows created by the bot
CREATE TABLE IF NOT EXISTS escrows (
  id                         BIGSERIAL PRIMARY KEY,

  -- On-chain identifiers
  escrow_address             TEXT NOT NULL UNIQUE,
  factory_tx_hash            TEXT NULL,

  -- Discord context
  channel_id                 TEXT NULL,
  thread_id                  TEXT NULL,
  status_message_id          TEXT NULL,

  -- Who initiated this (Discord user)
  creator_user_id            TEXT NULL,

  -- Parties (Discord + on-chain)
  buyer_discord_id           TEXT NULL,
  seller_discord_id          TEXT NULL,
  buyer_address              TEXT NULL,
  seller_address             TEXT NULL,

  -- State/amount
  amount_wei                 NUMERIC(78,0) NULL,
  status                     SMALLINT NULL, -- 0=Created,1=Funded,2=Delivered,3=Completed,4=Cancelled,5=Disputed
  status_text                TEXT NULL,

  -- Audit
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes for queries
CREATE INDEX IF NOT EXISTS idx_escrows_thread ON escrows (thread_id);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows (status);
CREATE INDEX IF NOT EXISTS idx_escrows_created_at ON escrows (created_at);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_escrows_updated_at ON escrows;
CREATE TRIGGER trg_escrows_updated_at
BEFORE UPDATE ON escrows
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- End of migration
