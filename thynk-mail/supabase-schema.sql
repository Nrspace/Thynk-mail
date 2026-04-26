-- MailFlow Platform Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- Email Accounts
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail','zoho','outlook','brevo','smtp')),
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass_encrypted TEXT,
  oauth_token_encrypted TEXT,
  daily_limit INTEGER NOT NULL DEFAULT 500,
  sent_today INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_accounts_team ON email_accounts(team_id);

-- Contact Lists
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lists_team ON lists(team_id);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  metadata JSONB DEFAULT '{}',
  is_subscribed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_team ON contacts(team_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Contact <> List junction
CREATE TABLE IF NOT EXISTS contact_lists (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (contact_id, list_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_lists_list ON contact_lists(list_id);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  variables TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_templates_team ON templates(team_id);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT,
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  list_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_team ON campaigns(team_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- Send Logs
CREATE TABLE IF NOT EXISTS send_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','failed','unsubscribed')),
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_send_logs_campaign ON send_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_contact ON send_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_status ON send_logs(status);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  send_log_id UUID NOT NULL REFERENCES send_logs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('open','click','bounce','unsubscribe','complaint')),
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_send_log ON events(send_log_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Suppressions
CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce','unsubscribe','complaint','manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);
CREATE INDEX IF NOT EXISTS idx_suppressions_team_email ON suppressions(team_id, email);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function: reset daily send counts
CREATE OR REPLACE FUNCTION reset_daily_send_counts()
RETURNS void AS $$
BEGIN
  UPDATE email_accounts
  SET sent_today = 0, last_reset_date = CURRENT_DATE
  WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (enable for production)
-- ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
