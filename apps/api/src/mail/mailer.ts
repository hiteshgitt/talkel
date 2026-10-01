import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Sends through SMTP (Mailpit in development; a real provider's SMTP in production). */
export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Sends through the Resend HTTP API (production). EMAIL_FROM must use a domain verified in Resend. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
  }
}

/** No SMTP configured: log the email so a developer can still follow the link. Never used in production. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('LogMailer');

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(`SMTP_URL not set — email to ${message.to}: ${message.subject}\n${message.text}`);
  }
}

// ───────────── Templates ─────────────

function layout(heading: string, body: string, buttonLabel: string, url: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f4f5f7;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;color:#0f1115">${heading}</h2>
<p style="color:#3b4250;line-height:1.5">${body}</p>
<p style="margin:24px 0"><a href="${url}" style="background:#6e8bff;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${buttonLabel}</a></p>
<p style="color:#8a909c;font-size:12px">If the button doesn't work, open this link:<br>${url}</p>
</div></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Verify your email for Talkel',
    text: `Hi ${name},\n\nConfirm your email to start practising:\n${url}\n\nIf you didn't sign up, ignore this email.`,
    html: layout(`Hi ${escapeHtml(name)} 👋`, 'Confirm your email address to start practising English conversations.', 'Verify email', url),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Reset your Talkel password',
    text: `Hi ${name},\n\nReset your password here (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
    html: layout('Reset your password', 'Someone (hopefully you) asked to reset your Talkel password. The link is valid for 1 hour.', 'Choose a new password', url),
  };
}

export function accountDeletedEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Your Talkel account has been deleted',
    text: `Hi ${name},\n\nYour Talkel account and all its data (conversations, feedback, recordings and memories) have been deleted.\n\nIf this wasn't you, reply to this email right away.\nYou're always welcome back: ${url}`,
    html: layout(
      'Your account has been deleted',
      `Hi ${escapeHtml(name)}, your Talkel account and all its data — conversations, feedback, recordings and memories — have been deleted. If this wasn't you, reply to this email right away.`,
      'Visit Talkel',
      url,
    ),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
