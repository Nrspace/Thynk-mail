-- Fixes for:
--   (4) Duplicate emails on large (10k+) sends caused by two invocations of
--       processCampaignChunk racing on the same campaign (Vercel Cron tick +
--       browser SSE loop, or a retried request overlapping a still-running one).
--
-- Adds a short-lived, self-expiring lock column on campaigns so only one
-- worker can ever be actively sending a given campaign at a time.
-- Safe to run multiple times.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS processing_lock_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_processing_lock ON campaigns(processing_lock_at);
