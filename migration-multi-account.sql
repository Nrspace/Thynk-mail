-- ============================================================
-- Migration: Multi-Account Support for Campaigns
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Add account_ids column to campaigns (array of email_account UUIDs)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS account_ids UUID[] DEFAULT '{}';

-- 2. Backfill existing campaigns: copy single account_id into the new array
UPDATE campaigns
SET account_ids = ARRAY[account_id]
WHERE account_id IS NOT NULL
  AND (account_ids IS NULL OR account_ids = '{}');

-- 3. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_campaigns_account_ids ON campaigns USING GIN(account_ids);

-- That's it. The account_id column stays for backwards compatibility.
-- New campaigns will populate both account_id (first/primary) and account_ids (full list).
