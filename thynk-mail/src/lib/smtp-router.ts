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
  // Simple base64 decode — replace with proper AES in production
  try {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  } catch {
    return encrypted;
  }
}

function buildTransport(account: EmailAccount) {
  const pass = account.smtp_pass_encrypted
    ? decryptCredential(account.smtp_pass_encrypted)
    : '';

  switch (account.provider) {
    case 'gmail':
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: account.smtp_user || account.email,
          pass,
        },
      });

    case 'brevo':
      return nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          // Brevo login: the generated SMTP login (e.g. abc123@smtp-brevo.com)
          // stored in smtp_user; password is the SMTP key stored in smtp_pass_encrypted
          user: account.smtp_user || account.email,
          pass,
        },
      });

    case 'zoho':
      return nodemailer.createTransport({
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
        auth: {
          user: account.smtp_user || account.email,
          pass,
        },
      });

    case 'outlook':
      return nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          user: account.smtp_user || account.email,
          pass,
        },
      });

    case 'smtp':
    default:
      return nodemailer.createTransport({
        host: account.smtp_host || 'localhost',
        port: account.smtp_port || 587,
        secure: account.smtp_port === 465,
        auth: {
          user: account.smtp_user || account.email,
          pass,
        },
      });
  }
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  try {
    const transport = buildTransport(opts.account);

    const info = await transport.sendMail({
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
        ...opts.headers,
      },
    });

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function testConnection(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = buildTransport(account);
    await transport.verify();
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
