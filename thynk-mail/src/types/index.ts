export type EmailProvider = 'gmail' | 'zoho' | 'outlook' | 'brevo' | 'smtp';

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
  daily_limit: number;
  sent_today: number;
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
}

export interface SendLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  account_id: string;
  status: SendLogStatus;
  message_id?: string;
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
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
