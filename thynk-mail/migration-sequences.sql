-- ============================================================================
-- Migration: Email Sequences (multi-step automated drip with auto scheduler)
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Model: a sequence is a set of 2-5 ordered steps. When launched, every step
-- is created as a normal row in `campaigns` (sequence_id / sequence_step set)
-- so sending, tracking, unsubscribes, bounces and reports all keep using the
-- existing campaign engine. The scheduler (cron) flips each step from
-- 'scheduled' -> 'sending' when its time arrives.
-- ============================================================================

-- 1. Sequences
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','completed','cancelled')),
  list_ids UUID[] NOT NULL DEFAULT '{}',
  account_ids UUID[] NOT NULL DEFAULT '{}',
  reply_to TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  -- NULL = start as soon as the sequence is launched
  start_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sequences_team ON sequences(team_id);
CREATE INDEX IF NOT EXISTS idx_sequences_status ON sequences(status);

-- 2. Sequence steps (the editable definition; copied into campaigns on launch)
CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number >= 1),
  subject TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  -- Wait before this step, counted from the PREVIOUS step's send time.
  -- Ignored for step 1.
  delay_amount INTEGER NOT NULL DEFAULT 1 CHECK (delay_amount >= 1),
  delay_unit TEXT NOT NULL DEFAULT 'days' CHECK (delay_unit IN ('hours','days')),
  -- 'HH:MM' in the sequence timezone. Only used when delay_unit = 'days'.
  send_time TEXT,
  -- Who gets this step (step 2+):
  --   all         = everyone who received step 1 (still subscribed)
  --   not_opened  = received the previous step and did NOT open it
  --   opened      = received the previous step and opened it
  --   not_clicked = received the previous step and did NOT click it
  --   clicked     = received the previous step and clicked it
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all','not_opened','opened','not_clicked','clicked')),
  -- Filled in on launch
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sequence_id, step_number)
);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);

-- 3. Link campaigns back to their sequence step
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_step INTEGER;
-- Where this step's recipients come from: the send_logs of another campaign
-- (step 1 for audience 'all', otherwise the previous step) + the engagement
-- filter to apply. NULL for ordinary campaigns (they use list_ids).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_condition TEXT;
-- Why a campaign is paused ('daily_limit' | 'failures' | 'sequence_paused').
-- Lets the scheduler auto-resume campaigns that only hit the daily sending cap.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_campaigns_sequence ON campaigns(sequence_id);
