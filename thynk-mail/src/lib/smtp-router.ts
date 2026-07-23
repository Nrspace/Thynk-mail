import nodemailer from 'nodemailer';
import {
  SESClient,
  SendRawEmailCommand,
  GetSendQuotaCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';
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

function buildSesClient(region: string, accessKeyId: string, secretAccessKey: string): SESClient {
  return new SESClient({ region, credentials: { accessKeyId, secretAccessKey } });
}

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

      const ses = buildSesClient(region, accessKeyId, secretAccessKey);

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
  if (cfg.provider === 'ses') {
    if (!cfg.ses_access_key_id || !cfg.ses_secret_access_key) {
      return { ok: false, error: 'Amazon SES Access Key ID and Secret Access Key are required' };
    }
    const health = await checkSesHealth({
      email: cfg.email,
      region: cfg.ses_region,
      accessKeyId: cfg.ses_access_key_id,
      secretAccessKey: cfg.ses_secret_access_key,
    });
    return sesHealthToTestResult(health);
  }

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

export interface SesHealthResult {
  ok: boolean;
  error?: string;
  isSandbox?: boolean;
  identityVerified?: boolean;
  max24HourSend?: number;
  sentLast24Hours?: number;
  quotaCheckDenied?: boolean;
  sendPermissionConfirmed?: boolean;
}

/**
 * Amazon SES's own `transport.verify()` (via nodemailer) only proves the AWS
 * credentials are well-formed and can reach the API — it sends a deliberately
 * malformed test message and treats ANY "InvalidParameterValue" response as
 * success. It does NOT check the two things that actually break real campaign
 * sends on SES:
 *   1. The account is still in the SES Sandbox (new AWS accounts default to
 *      this) — in Sandbox, SES silently rejects every send to a recipient
 *      that isn't itself a verified address, which is why a whole campaign
 *      can show 0 delivered with no obvious cause.
 *   2. The "From" address/domain on the account was never verified in SES —
 *      every send then fails with "Email address is not verified".
 * This check calls the real SES account APIs to catch both up front.
 */
export async function checkSesHealth(cfg: {
  email: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<SesHealthResult> {
  const region = cfg.region || 'us-east-1';
  const ses = buildSesClient(region, cfg.accessKeyId, cfg.secretAccessKey);

  let isSandbox: boolean | undefined;
  let max24HourSend: number | undefined;
  let sentLast24Hours: number | undefined;
  let quotaCheckDenied = false;

  try {
    const quota = await withTimeout(ses.send(new GetSendQuotaCommand({})), SMTP_CONNECTION_TIMEOUT, 'GetSendQuota');
    // AWS's default Sandbox quota is exactly 200 messages / 24h — a strong signal
    // (not 100% certain, but no legitimate production account is capped this low).
    isSandbox = (quota.Max24HourSend ?? 0) <= 200;
    max24HourSend = quota.Max24HourSend;
    sentLast24Hours = quota.SentLast24Hours;
  } catch (err: unknown) {
    // A LOT of real-world IAM policies only grant send permissions, not
    // account-status read permissions (ses:GetSendQuota). That alone doesn't
    // mean sending will fail, so we don't treat it as fatal — we just can't
    // report the Sandbox/quota status, and we say so explicitly below.
    const message = err instanceof Error ? err.message : String(err);
    if (/not authorized|AccessDenied/i.test(message)) {
      quotaCheckDenied = true;
    } else {
      // Anything else (bad credentials, wrong region, network error) IS fatal —
      // it means the account itself can't be reached at all.
      return { ok: false, error: message };
    }
  }

  let identityVerified: boolean | undefined;
  try {
    const verification = await withTimeout(
      ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [cfg.email] })),
      SMTP_CONNECTION_TIMEOUT,
      'GetIdentityVerificationAttributes'
    );
    const attrs = verification.VerificationAttributes?.[cfg.email];
    identityVerified = attrs?.VerificationStatus === 'Success';
  } catch {
    // Non-fatal — some IAM policies don't grant this either.
  }

  // If we couldn't check quota OR identity verification (narrow IAM policy),
  // fall back to nodemailer's SES verify() to at least confirm the credentials
  // can actually invoke ses:SendRawEmail — proving basic send capability works
  // even though we can't see Sandbox/verification status from here.
  let sendPermissionConfirmed: boolean | undefined;
  if (quotaCheckDenied && identityVerified === undefined) {
    try {
      const transport = nodemailer.createTransport({ SES: { ses, aws: { SendRawEmailCommand } } });
      await withTimeout(transport.verify(), SMTP_CONNECTION_TIMEOUT, 'verify');
      sendPermissionConfirmed = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Credentials could not send via SES: ${message}` };
    }
  }

  return {
    ok: true,
    isSandbox,
    identityVerified,
    max24HourSend,
    sentLast24Hours,
    quotaCheckDenied,
    sendPermissionConfirmed,
  };
}

/** Turns a raw SES health check into a clear, actionable message for the UI. */
function sesHealthToTestResult(health: SesHealthResult): { ok: boolean; error?: string } {
  if (!health.ok) return { ok: false, error: health.error };

  const warnings: string[] = [];
  if (health.isSandbox) {
    warnings.push(
      `Your SES account is still in the Sandbox (limit: ${health.max24HourSend}/24h). ` +
      `In Sandbox mode, SES only delivers to recipient addresses that are themselves verified in SES — ` +
      `this is almost always why a real campaign sends 0 emails. Request "Production Access" in the AWS SES console to fix this.`
    );
  }
  if (health.identityVerified === false) {
    warnings.push(
      `The sending address is not a verified identity in SES yet. Verify it (or its domain) in the AWS SES console ` +
      `under Verified Identities — unverified senders are rejected on every send.`
    );
  }
  if (health.quotaCheckDenied) {
    warnings.push(
      `Note: this IAM user isn't allowed to check Sandbox/quota status (missing ses:GetSendQuota permission), ` +
      (health.sendPermissionConfirmed
        ? `but sending itself was confirmed to work. `
        : ``) +
      `Add ses:GetSendQuota and ses:GetIdentityVerificationAttributes to the IAM policy for a full check, ` +
      `or verify Sandbox status manually in the AWS SES console.`
    );
  }

  if (health.isSandbox || health.identityVerified === false) {
    return { ok: false, error: warnings.join(' ') };
  }
  // Quota-check-denied alone is just an incomplete check, not a known failure —
  // report success with the caveat rather than blocking the user.
  return { ok: true, error: warnings.length ? warnings.join(' ') : undefined };
}

export async function testConnection(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
  if (account.provider === 'ses') {
    const accessKeyId = account.ses_access_key_id || '';
    const secretAccessKey = account.ses_secret_access_key_encrypted
      ? decryptCredential(account.ses_secret_access_key_encrypted)
      : '';
    if (!accessKeyId || !secretAccessKey) {
      return { ok: false, error: 'Amazon SES Access Key ID and Secret Access Key are required' };
    }
    const health = await checkSesHealth({
      email: account.email,
      region: account.ses_region,
      accessKeyId,
      secretAccessKey,
    });
    return sesHealthToTestResult(health);
  }

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
