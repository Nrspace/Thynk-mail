-- Run this in Supabase SQL Editor before deploying
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT;

-- Verify
SELECT id, name, provider,
       api_key_encrypted IS NOT NULL AS has_api_key
FROM email_accounts
WHERE provider = 'brevo';
