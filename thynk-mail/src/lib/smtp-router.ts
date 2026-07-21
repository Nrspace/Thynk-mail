import nodemailer from 'nodemailer';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import type { EmailAccount } from '@/types';

export interface SendEmailOptions {
  account: EmailAccount;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  headers?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function decryptCredential(encrypted: string): string {
  try {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  } catch {
    return encrypted;
  }
}

function encryptCredential(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64');
}

// ── Transport pool — reuse one authenticated connection per account ──────────
// Key: account.id → nodemailer transporter
const transportPool = new Map<string, nodemailer.Transporter>();

// Socket + connection timeouts (ms) applied to every transport
const SMTP_CONNECTION_TIMEOUT = 10_000; // 10s to establish TCP + TLS
const SMTP_SOCKET_TIMEOUT     = 15_000; // 15s idle socket before abort
const SEND_TIMEOUT_MS         = 20_000; // hard outer timeout per sendMail call

export function buildTransport(account: EmailAccount): nodemailer.Transporter {
  const pass = account.smtp_pass_encrypted
    ? decryptCredential(account.smtp_pass_encrypted)
    : '';

  const timeouts = {
    connectionTimeout: SMTP_CONNECTION_TIMEOUT,
    socketTimeout:     SMTP_SOCKET_TIMEOUT,
    greetingTimeout:   SMTP_CONNECTION_TIMEOUT,
  };

  switch (account.provider) {
    case 'ses': {
      const region          = account.ses_region || 'us-east-1';
      const accessKeyId     = account.ses_access_key_id || '';
      const secretAccessKey = account.ses_secret_access_key_encrypted
        ? decryptCredential(account.ses_secret_access_key_encrypted)
        : '';

      if (!accessKeyId || !secretAccessKey) {
        throw new Error('Amazon SES Access Key ID and Secret Access Key are required');
      }

      const ses = new SESClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      // API-based transport (no pooled SMTP connection needed for SES)
      return nodemailer.createTransport({
        SES: { ses, aws: { SendRawEmailCommand } },
      });
    }

    case 'gmail':
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: account.smtp_user || account.email, pass },
        pool: true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'brevo':
      return nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: { user: account.smtp_user || account.email, pass },
        pool: true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'zoho': {
      const email = account.smtp_user || account.email;
      let zohoHost = account.smtp_host ?? '';
      if (!zohoHost) {
        const domain = email.split('@')[1]?.toLowerCase() ?? '';
        if (domain.endsWith('.in'))       zohoHost = 'smtp.zoho.in';
        else if (domain.endsWith('.eu'))  zohoHost = 'smtp.zoho.eu';
        else                              zohoHost = 'smtp.zoho.com';
      }
      return nodemailer.createTransport({
        host: zohoHost,
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: email, pass },
        tls: { rejectUnauthorized: false },
        pool: true,
        maxConnections: 1,
        ...timeouts,
      });
    }

    case 'outlook':
      return nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: { user: account.smtp_user || account.email, pass },
        pool: true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'smtp':
    default:
      return nodemailer.createTransport({
        host: account.smtp_host || 'localhost',
        port: account.smtp_port || 587,
        secure: account.smtp_port === 465,
        auth: { user: account.smtp_user || account.email, pass },
        pool: true,
        maxConnections: 1,
        ...timeouts,
      });
  }
}

/** Get or create a pooled transport for an account */
function getTransport(account: EmailAccount): nodemailer.Transporter {
  const existing = transportPool.get(account.id);
  if (existing) return existing;
  const t = buildTransport(account);
  transportPool.set(account.id, t);
  return t;
}

/** Remove a broken transport from the pool so next call rebuilds it */
function evictTransport(accountId: string) {
  const t = transportPool.get(accountId);
  if (t) {
    try { (t as any).close?.(); } catch {}
    transportPool.delete(accountId);
  }
}

/** Wrap a promise with a hard timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const transport = getTransport(opts.account);
  const isSes = opts.account.provider === 'ses';
  try {
    const info = await withTimeout(
      transport.sendMail({
        from: `"${opts.fromName}" <${opts.fromEmail}>`,
        to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || '',
        replyTo: opts.replyTo,
        attachments: opts.attachments,
        headers: {
          'List-Unsubscribe': opts.headers?.['List-Unsubscribe'] || '',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          // Tags this send to the SES configuration set so SNS delivery/
          // open/click/bounce/complaint events fire for it.
          ...(isSes && opts.account.ses_configuration_set
            ? { 'X-SES-CONFIGURATION-SET': opts.account.ses_configuration_set }
            : {}),
          ...opts.headers,
        },
      }),
      SEND_TIMEOUT_MS,
      `sendMail to ${opts.to}`
    );
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Evict broken/timed-out transport so next email gets a fresh connection
    evictTransport(opts.account.id);
    return { success: false, error: message };
  }
}

export interface DraftAccountConfig {
  provider: EmailAccount['provider'];
  email: string;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_host?: string;
  smtp_port?: number;
  ses_region?: string;
  ses_access_key_id?: string;
  ses_secret_access_key?: string;
}

/**
 * Verify a set of email-account credentials before the account has been saved
 * (and therefore has no id / pooled transport yet). Used by the "Test Connection"
 * button on the Add Account form, for every provider type (SMTP, Gmail, Zoho,
 * Outlook, Brevo, SES).
 */
export async function testConfig(cfg: DraftAccountConfig): Promise<{ ok: boolean; error?: string }> {
  const fakeAccount = {
    id: `draft-${Date.now()}`,
    provider: cfg.provider,
    email: cfg.email,
    smtp_user: cfg.smtp_user,
    smtp_pass_encrypted: cfg.smtp_pass ? encryptCredential(cfg.smtp_pass) : '',
    smtp_host: cfg.smtp_host,
    smtp_port: cfg.smtp_port,
    ses_region: cfg.ses_region,
    ses_access_key_id: cfg.ses_access_key_id,
    ses_secret_access_key_encrypted: cfg.ses_secret_access_key ? encryptCredential(cfg.ses_secret_access_key) : '',
  } as unknown as EmailAccount;

  let transport: nodemailer.Transporter | null = null;
  try {
    transport = buildTransport(fakeAccount);
    await withTimeout(transport.verify(), SMTP_CONNECTION_TIMEOUT, 'verify');
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    try { (transport as any)?.close?.(); } catch {}
  }
}

export async function testConnection(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    // Always use a fresh transport for connection test
    evictTransport(account.id);
    const transport = getTransport(account);
    await withTimeout(transport.verify(), SMTP_CONNECTION_TIMEOUT, 'verify');
    return { ok: true };
  } catch (err: unknown) {
    evictTransport(account.id);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
