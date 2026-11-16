import nodemailer from 'nodemailer';
import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Env } from '../config/env';

export interface EmailService {
  sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void>;
  sendTaskReminderEmail(to: string, name: string, taskTitle: string, plannerUrl: string): Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function verificationTemplate(name: string, verifyUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verifyUrl);
  return {
    subject: 'Verify your LearnSpace email',
    text: `Hi ${name},\n\nVerify your LearnSpace email address by opening this link (valid for 24 hours):\n${verifyUrl}\n\nIf you did not create an account, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">
        <h2 style="margin:0 0 12px;color:#4f46e5;">LearnSpace</h2>
        <p>Hi ${safeName},</p>
        <p>Welcome to LearnSpace. Please confirm your email address to unlock the AI Study Assistant and email reminders.</p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Verify email
          </a>
        </p>
        <p style="font-size:13px;color:#4b5563;">This link expires in 24 hours. If the button does not work, copy and paste this URL:<br>${safeUrl}</p>
      </div>
    `,
  };
}

function resetTemplate(name: string, resetUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: 'Reset your LearnSpace password',
    text: `Hi ${name},\n\nReset your LearnSpace password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">
        <h2 style="margin:0 0 12px;color:#4f46e5;">LearnSpace</h2>
        <p>Hi ${safeName},</p>
        <p>We received a request to reset your LearnSpace password. Click below to choose a new one.</p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="font-size:13px;color:#4b5563;">This link expires in 1 hour. If you didn't ask for this, you can safely ignore this message.</p>
      </div>
    `,
  };
}

function reminderTemplate(name: string, taskTitle: string, plannerUrl: string) {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(taskTitle);
  const safeUrl = escapeHtml(plannerUrl);
  return {
    subject: `Study reminder: ${taskTitle}`,
    text: `Hi ${name},\n\nReminder for your task "${taskTitle}". Open LearnSpace to view your planner: ${plannerUrl}\n`,
    html: `<p>Hi ${safeName},</p><p>Reminder for your task <strong>${safeTitle}</strong>.</p><p><a href="${safeUrl}">Open Study Planner</a></p>`,
  };
}

export function createEmailService(
  env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM' | 'SMTP_URL'>,
  logger: Logger,
): EmailService {
  const from = env.EMAIL_FROM ?? 'LearnSpace <no-reply@learnspace.local>';

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    const send = async (to: string, payload: { subject: string; text: string; html: string }) => {
      const { error } = await resend.emails.send({ from, to, ...payload });
      if (error) {
        logger.error({ err: error }, 'Resend failed to send email');
        throw new Error(error.message);
      }
    };
    return {
      sendVerificationEmail: (to, name, url) => send(to, verificationTemplate(name, url)),
      sendPasswordResetEmail: (to, name, url) => send(to, resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) => send(to, reminderTemplate(name, title, url)),
    };
  }

  if (env.SMTP_URL) {
    const transporter = nodemailer.createTransport(env.SMTP_URL);
    const send = async (to: string, payload: { subject: string; text: string; html: string }) => {
      await transporter.sendMail({ from, to, ...payload });
    };
    return {
      sendVerificationEmail: (to, name, url) => send(to, verificationTemplate(name, url)),
      sendPasswordResetEmail: (to, name, url) => send(to, resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) => send(to, reminderTemplate(name, title, url)),
    };
  }

  return {
    async sendVerificationEmail(to) {
      logger.warn({ to }, 'Email not configured (set RESEND_API_KEY or SMTP_URL); skipped verification email');
    },
    async sendPasswordResetEmail(to) {
      logger.warn({ to }, 'Email not configured (set RESEND_API_KEY or SMTP_URL); skipped reset email');
    },
    async sendTaskReminderEmail(to) {
      logger.warn({ to }, 'Email not configured (set RESEND_API_KEY or SMTP_URL); skipped reminder email');
    },
  };
}

