-- ============================================================
-- Migration: Amazon SES support (sending + delivery/open/click/
-- bounce tracking via SNS) for Thynk-mail
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Allow 'ses' as an email_accounts provider
ALTER TABLE email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_check;
ALTER TABLE email_accounts
  ADD CONSTRAINT email_accounts_provider_check
  CHECK (provider IN ('gmail','zoho','outlook','brevo','smtp','ses'));

-- 2. SES-specific credential/config columns on email_accounts
--    (mirrors the smtp_user/smtp_pass_encrypted pattern already used)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS ses_region TEXT DEFAULT 'us-east-1';
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS ses_access_key_id TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS ses_secret_access_key_encrypted TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS ses_configuration_set TEXT;

-- 3. Engagement-tracking columns on send_logs.
--    message_id/opened_at/clicked_at/bounced_at already exist — these add
--    the rest of what the SES/SNS webhook needs to record.
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ;
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS open_count     INTEGER DEFAULT 0;
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS click_count    INTEGER DEFAULT 0;
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS bounce_type    TEXT;
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS bounce_subtype TEXT;
ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS complained_at  TIMESTAMPTZ;

-- 4. 'complained' is a distinct terminal status from 'bounced' in SES —
--    widen the send_logs status check to allow it.
ALTER TABLE send_logs DROP CONSTRAINT IF EXISTS send_logs_status_check;
ALTER TABLE send_logs
  ADD CONSTRAINT send_logs_status_check
  CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','complained','failed','unsubscribed'));

-- 5. message_id lookup is on the hot path for every inbound SNS event —
--    index it (send_logs had no index on this column before).
CREATE INDEX IF NOT EXISTS idx_send_logs_message_id ON send_logs(message_id);

-- 6. The events table's type check predates SES's Send/Delivery event
--    types — widen it so the SES webhook can log them too.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_type_check
  CHECK (type IN ('send','delivery','open','click','bounce','unsubscribe','complaint'));

-- 7. Atomic increment helpers (used by both the open/click tracking pixel
--    and the SES webhook — created here in case they don't exist yet).
CREATE OR REPLACE FUNCTION increment_campaign_opens(cid UUID) RETURNS void AS $$
  UPDATE campaigns SET open_count = open_count + 1 WHERE id = cid;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION increment_campaign_clicks(cid UUID) RETURNS void AS $$
  UPDATE campaigns SET click_count = click_count + 1 WHERE id = cid;
$$ LANGUAGE sql;

-- ============================================================
-- One-time AWS-side setup (do this in the AWS Console, per SES-sending
-- account you create in Thynk-mail):
--
--   1. SES → Verified identities → verify the sending domain/email.
--   2. SES → Configuration sets → create one (e.g. "thynk-mail"), then on
--      it enable "Open tracking" and "Click tracking".
--   3. On that configuration set → Event destinations → add destination →
--      SNS → create/select a topic → send event types: Send, Delivery,
--      Bounce, Complaint, Reject, Open, Click.
--   4. SNS → that topic → Create subscription → protocol HTTPS → endpoint =
--      https://<your-app-domain>/api/webhooks/ses
--      (this route auto-confirms the subscription — no manual click needed)
--   5. In Thynk-mail → Accounts → Add Account → Amazon SES, fill in the
--      region, access key, secret key, and set "Configuration Set" to the
--      name from step 2.
-- ============================================================
