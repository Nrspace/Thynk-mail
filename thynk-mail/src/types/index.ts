export type EmailProvider = 'gmail' | 'zoho' | 'outlook' | 'brevo' | 'smtp' | 'ses';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'paused'
  | 'failed';

export type SendLogStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'unsubscribed';

export type EventType =
  | 'open'
  | 'click'
  | 'bounce'
  | 'unsubscribe'
  | 'complaint';

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  provider: EmailProvider;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass_encrypted?: string;
  oauth_token_encrypted?: string;
  // Amazon SES (API-based sending + SNS delivery/open/click/bounce tracking)
  ses_region?: string;
  ses_access_key_id?: string;
  ses_secret_access_key_encrypted?: string;
  ses_configuration_set?: string;
  daily_limit: number;
  sent_today: number;
  last_reset_date?: string;
  is_active: boolean;
  team_id: string;
  created_at: string;
  updated_at: string;
}

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  team_id: string;
  contact_count: number;
  created_at: string;
}

export interface Contact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  metadata: Record<string, string>;
  team_id: string;
  is_subscribed: boolean;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body?: string;
  variables: string[];
  team_id: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  html_body: string;
  text_body?: string;
  template_id?: string;
  account_id: string;
  account_ids: string[];  // multi-account support
  list_ids: string[];
  status: CampaignStatus;
  scheduled_at?: string;
  sent_at?: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  // joined
  total_recipients?: number;
  sent_count?: number;
  open_count?: number;
  click_count?: number;
  bounce_count?: number;
  unsubscribe_count?: number;
  // sequence membership (null for ordinary campaigns)
  sequence_id?: string | null;
  sequence_step?: number | null;
  audience_campaign_id?: string | null;
  audience_condition?: string | null;
  pause_reason?: string | null;
}

export type SequenceStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type StepAudience = 'all' | 'not_opened' | 'opened' | 'not_clicked' | 'clicked';

export interface Sequence {
  id: string;
  team_id: string;
  name: string;
  description?: string | null;
  status: SequenceStatus;
  list_ids: string[];
  account_ids: string[];
  reply_to?: string | null;
  timezone: string;
  start_at?: string | null;
  launched_at?: string | null;
  completed_at?: string | null;
  status_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  subject: string;
  html_body: string;
  text_body?: string | null;
  template_id?: string | null;
  delay_amount: number;
  delay_unit: 'hours' | 'days';
  send_time?: string | null;
  audience: StepAudience;
  campaign_id?: string | null;
  scheduled_at?: string | null;
}

export interface SendLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  account_id: string;
  status: SendLogStatus;
  message_id?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  open_count?: number;
  clicked_at?: string;
  click_count?: number;
  bounced_at?: string;
  bounce_type?: string;
  bounce_subtype?: string;
  complained_at?: string;
  error_message?: string;
  contact?: Contact;
}

export interface EmailEvent {
  id: string;
  send_log_id: string;
  type: EventType;
  metadata: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface Suppression {
  id: string;
  email: string;
  reason: 'bounce' | 'unsubscribe' | 'complaint' | 'manual';
  team_id: string;
  created_at: string;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export interface TeamMember {
  id: string;
  user_id: string;
  team_id: string;
  role: 'owner' | 'admin' | 'member';
  email: string;
  created_at: string;
}
