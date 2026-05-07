import nodemailer from 'nodemailer';
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

// ── Transport pool ─────────────────────────────────────────────────────────────
// NOTE: On Vercel each invocation may be a different cold Lambda — the pool
// only helps within a single warm function invocation (e.g. the send loop).
// We still keep it because within one campaign send it reuses the connection.
const transportPool = new Map<string, nodemailer.Transporter>();

// FIX: Reduced connection timeout — was 10s, now 8s so a dead SMTP host fails
// faster and we move on rather than blocking the whole loop.
const SMTP_CONNECTION_TIMEOUT = 8_000;
const SMTP_SOCKET_TIMEOUT     = 12_000;
// FIX: Per-email send timeout increased slightly to handle slow SMTP servers
// without giving up too early and cascading failures.
const SEND_TIMEOUT_MS         = 25_000;

// FIX: Track consecutive auth failures per account so we can surface them clearly
const authFailCount = new Map<string, number>();

function buildTransport(account: EmailAccount): nodemailer.Transporter {
  const pass = account.smtp_pass_encrypted
    ? decryptCredential(account.smtp_pass_encrypted)
    : '';

  const timeouts = {
    connectionTimeout: SMTP_CONNECTION_TIMEOUT,
    socketTimeout:     SMTP_SOCKET_TIMEOUT,
    greetingTimeout:   SMTP_CONNECTION_TIMEOUT,
  };

  switch (account.provider) {
    case 'gmail':
      return nodemailer.createTransport({
        service: 'gmail',
        auth:    { user: account.smtp_user || account.email, pass },
        pool:    true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'brevo':
      return nodemailer.createTransport({
        host:    'smtp-relay.brevo.com',
        port:    587,
        secure:  false,
        auth:    { user: account.smtp_user || account.email, pass },
        pool:    true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'zoho': {
      const email = account.smtp_user || account.email;
      let zohoHost = account.smtp_host ?? '';
      if (!zohoHost) {
        const domain = email.split('@')[1]?.toLowerCase() ?? '';
        // ── Zoho datacenter detection ─────────────────────────────────────
        // Zoho has three datacenters: US (zoho.com), India (zoho.in), EU (zoho.eu).
        // Domain-based detection only works for @zohomail.in / @zoho.in addresses.
        // Custom domains (e.g. @company.com hosted on Zoho India) don't have
        // a .in TLD, so we CANNOT reliably auto-detect their datacenter.
        //
        // IMPORTANT: If you are on Zoho India with a custom domain, you MUST
        // set smtp_host = 'smtp.zoho.in' manually in Account Settings.
        // Failing to do so sends auth requests to smtp.zoho.com which will
        // reject India-datacenter credentials with "Invalid credentials".
        if (domain.endsWith('.in') || domain === 'zoho.in' || domain === 'zohomail.in') {
          zohoHost = 'smtp.zoho.in';
        } else if (domain.endsWith('.eu') || domain === 'zoho.eu') {
          zohoHost = 'smtp.zoho.eu';
        } else {
          // Default to US — custom domain users on India/EU MUST override smtp_host manually
          zohoHost = 'smtp.zoho.com';
        }
      }
      return nodemailer.createTransport({
        host:       zohoHost,
        port:       587,
        secure:     false,
        requireTLS: true,
        auth:       { user: email, pass },
        tls:        { rejectUnauthorized: false },
        pool:       true,
        maxConnections: 1,
        ...timeouts,
      });
    }

    case 'outlook':
      return nodemailer.createTransport({
        host:   'smtp.office365.com',
        port:   587,
        secure: false,
        auth:   { user: account.smtp_user || account.email, pass },
        pool:   true,
        maxConnections: 1,
        ...timeouts,
      });

    case 'smtp':
    default:
      return nodemailer.createTransport({
        host:   account.smtp_host || 'localhost',
        port:   account.smtp_port || 587,
        secure: account.smtp_port === 465,
        auth:   { user: account.smtp_user || account.email, pass },
        pool:   true,
        maxConnections: 1,
        ...timeouts,
      });
  }
}

function getTransport(account: EmailAccount): nodemailer.Transporter {
  const existing = transportPool.get(account.id);
  if (existing) return existing;
  const t = buildTransport(account);
  transportPool.set(account.id, t);
  return t;
}

function evictTransport(accountId: string) {
  const t = transportPool.get(accountId);
  if (t) {
    try { (t as any).close?.(); } catch {}
    transportPool.delete(accountId);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
      ms
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const transport = getTransport(opts.account);
  try {
    const info = await withTimeout(
      transport.sendMail({
        from:        `"${opts.fromName}" <${opts.fromEmail}>`,
        to:          opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
        subject:     opts.subject,
        html:        opts.html,
        text:        opts.text || '',
        replyTo:     opts.replyTo,
        attachments: opts.attachments,
        headers: {
          'List-Unsubscribe':      opts.headers?.['List-Unsubscribe'] || '',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          ...opts.headers,
        },
      }),
      SEND_TIMEOUT_MS,
      `sendMail to ${opts.to}`
    );

    // Clear auth failure counter on success
    authFailCount.delete(opts.account.id);
    return { success: true, messageId: info.messageId };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // FIX: always evict on failure so next email gets a fresh connection
    evictTransport(opts.account.id);

    // FIX: track auth failures — surface as a clearer error after 3 consecutive
    const isAuthErr = /auth|535|credentials|password/i.test(message);
    if (isAuthErr) {
      const count = (authFailCount.get(opts.account.id) ?? 0) + 1;
      authFailCount.set(opts.account.id, count);
      if (count >= 3) {
        return {
          success: false,
          error: `Authentication failed for ${opts.account.email} (${count}x). Check app password / credentials in account settings.`,
        };
      }
    }

    return { success: false, error: message };
  }
}

export async function testConnection(
  account: EmailAccount
): Promise<{ ok: boolean; error?: string }> {
  try {
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
