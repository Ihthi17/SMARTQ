import nodemailer from 'nodemailer';
import { Setting } from '../settings/setting.model.js';

let _transporter = null;
let _lastConfig = '';

/**
 * Returns a live Nodemailer transporter built from DB settings.
 * Re-creates only when the config has changed.
 * Returns null when SMTP is not yet configured or disabled.
 */
export const getTransporter = async () => {
  const [host, port, user, pass, enabled] = await Promise.all([
    Setting.get('smtp_host'),
    Setting.get('smtp_port', 587),
    Setting.get('smtp_user'),
    Setting.get('smtp_pass'),
    Setting.get('smtp_enabled', false),
  ]);

  if (!enabled || !host || !user || !pass) return null;

  const sig = `${host}:${port}:${user}:${pass}`;
  if (_transporter && sig === _lastConfig) return _transporter;

  _transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });

  _lastConfig = sig;
  return _transporter;
};

/**
 * Send an email using current DB-stored SMTP settings.
 * Falls back to logging when SMTP is not configured (dev mode).
 */
export const sendEmail = async ({ to, subject, html, text, attachments }) => {
  const transporter = await getTransporter();

  if (!transporter) {
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    return { mocked: true };
  }

  const from = (await Setting.get('smtp_from')) || (await Setting.get('smtp_user'));
  const info = await transporter.sendMail({ from, to, subject, html, text, attachments });
  return info;
};

/**
 * Convenience wrapper for password-reset emails.
 */
export const sendPasswordResetEmail = async ({ to, resetLink }) => {
  return sendEmail({
    to,
    subject: 'Smart Queue — Reset your password',
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Click here to reset your password</a></p>
      <p>This link expires in 15 minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    `,
    text: `Reset your password: ${resetLink}\n\nExpires in 15 minutes.`,
  });
};
