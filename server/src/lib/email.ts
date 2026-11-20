import type { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Env } from '../config/env';
import { OTP_EXPIRY_MINUTES } from './tokens';

export interface ClassReminderEmailParams {
  to: string;
  name: string;
  courseLabel: string;
  startsAtLabel: string;
  venue: string | null;
  timetableUrl: string;
}

export interface ExamReminderEmailParams {
  to: string;
  name: string;
  courseLabel: string;
  examTitle: string;
  startsAtLabel: string;
  venue: string | null;
  examsUrl: string;
}

export interface EmailService {
  sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void>;
  sendOtpEmail(params: { email: string; name: string; code: string }): Promise<void>;
  sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void>;
  sendTaskReminderEmail(
    to: string,
    name: string,
    taskTitle: string,
    plannerUrl: string,
  ): Promise<void>;
  sendClassReminderEmail(params: ClassReminderEmailParams): Promise<void>;
  sendExamReminderEmail(params: ExamReminderEmailParams): Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] ?? fromHeader).trim();
}

function extractSenderName(fromHeader: string): string {
  const idx = fromHeader.indexOf('<');
  if (idx > 0) {
    return fromHeader.slice(0, idx).trim().replace(/^"|"$/g, '') || 'LearnSpace';
  }
  return 'LearnSpace';
}

export function otpTemplate(name: string, code: string) {
  const safeName = escapeHtml(name || 'there');
  const safeCode = escapeHtml(code);
  return {
    subject: 'Your LearnSpace verification code',
    text: [
      `Hi ${name || 'there'},`,
      '',
      `Your LearnSpace verification code is: ${code}`,
      '',
      `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      '',
      'If you did not request this, you can safely ignore this email.',
      '',
      'LearnSpace',
    ].join('\n'),
    html: [
      '<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.5;">',
      '<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#2563eb;">LearnSpace</p>',
      `<p style="margin:0 0 12px;">Hi ${safeName},</p>`,
      '<p style="margin:0 0 16px;">Use this verification code to confirm your email address:</p>',
      `<p style="margin:0 0 16px;padding:14px 18px;background:#f1f5f9;border-radius:10px;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:6px;color:#0f172a;display:inline-block;">${safeCode}</p>`,
      `<p style="margin:0 0 12px;font-size:14px;color:#334155;">This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
      '<p style="margin:0;font-size:13px;color:#64748b;">If you did not request this, you can safely ignore this email.</p>',
      '</div>',
    ].join(''),
  };
}

function verificationTemplate(name: string, verifyUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verifyUrl);
  return {
    subject: 'Verify your LearnSpace email',
    text: `Hi ${name},\n\nVerify your LearnSpace email address by opening this link (valid for 24 hours):\n${verifyUrl}\n\nIf you did not create an account, you can safely ignore this email.`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">
        <h2 style="margin:0 0 12px;color:#2563eb;">LearnSpace</h2>
        <p>Hi ${safeName},</p>
        <p>Welcome to LearnSpace. Please confirm your email address to access your workspace.</p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Verify email
          </a>
        </p>
        <p style="font-size:13px;color:#4b5563;">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
      </div>
    `,
  };
}

function resetTemplate(name: string, resetUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: 'Reset your LearnSpace password',
    text: `Hi ${name},\n\nReset your LearnSpace password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">
        <h2 style="margin:0 0 12px;color:#2563eb;">LearnSpace</h2>
        <p>Hi ${safeName},</p>
        <p>We received a request to reset your LearnSpace password. Click below to choose a new one.</p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
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

function classReminderTemplate({
  name,
  courseLabel,
  startsAtLabel,
  venue,
  timetableUrl,
}: Omit<ClassReminderEmailParams, 'to'>) {
  const safeName = escapeHtml(name);
  const safeCourse = escapeHtml(courseLabel);
  const safeWhen = escapeHtml(startsAtLabel);
  const safeVenue = venue ? escapeHtml(venue) : null;
  const safeUrl = escapeHtml(timetableUrl);
  const venueLine = venue ? `\nVenue: ${venue}` : '';
  const htmlVenue = safeVenue ? ` · Venue: <strong>${safeVenue}</strong>` : '';
  return {
    subject: `Upcoming class: ${courseLabel}`,
    text: `Hi ${name},\n\nYour class ${courseLabel} starts at ${startsAtLabel}.${venueLine}\n\nView your timetable: ${timetableUrl}\n`,
    html: `<p>Hi ${safeName},</p><p>Reminder: your class <strong>${safeCourse}</strong> is scheduled for <strong>${safeWhen}</strong>${htmlVenue}.</p><p><a href="${safeUrl}">Open Timetable</a></p>`,
  };
}

function examReminderTemplate({
  name,
  courseLabel,
  examTitle,
  startsAtLabel,
  venue,
  examsUrl,
}: Omit<ExamReminderEmailParams, 'to'>) {
  const safeName = escapeHtml(name);
  const safeCourse = escapeHtml(courseLabel);
  const safeTitle = escapeHtml(examTitle);
  const safeWhen = escapeHtml(startsAtLabel);
  const safeVenue = venue ? escapeHtml(venue) : null;
  const safeUrl = escapeHtml(examsUrl);
  const venueLine = venue ? `\nVenue: ${venue}` : '';
  const htmlVenue = safeVenue ? ` · Venue: <strong>${safeVenue}</strong>` : '';
  return {
    subject: `Exam reminder: ${courseLabel} — ${examTitle}`,
    text: `Hi ${name},\n\nReminder for your upcoming exam: ${courseLabel} (${examTitle}) at ${startsAtLabel}.${venueLine}\n\nView your exam countdowns: ${examsUrl}\n`,
    html: `<p>Hi ${safeName},</p><p>Upcoming exam reminder: <strong>${safeCourse}</strong> — ${safeTitle} on <strong>${safeWhen}</strong>${htmlVenue}.</p><p><a href="${safeUrl}">Open Exams &amp; Revision Plan</a></p>`,
  };
}

export function createEmailService(
  env: Pick<
    Env,
    | 'EMAIL_PROVIDER'
    | 'RESEND_API_KEY'
    | 'BREVO_API_KEY'
    | 'EMAIL_FROM'
    | 'EMAIL_REPLY_TO'
    | 'ADMIN_EMAIL'
    | 'SMTP_URL'
    | 'EMAILJS_SERVICE_ID'
    | 'EMAILJS_TEMPLATE_ID'
    | 'EMAILJS_RESET_TEMPLATE_ID'
    | 'EMAILJS_PUBLIC_KEY'
    | 'EMAILJS_PRIVATE_KEY'
  >,
  logger: Logger,
  prisma?: PrismaClient,
): EmailService {
  const from = env.EMAIL_FROM ?? 'LearnSpace <no-reply@learnspace.app>';
  const replyTo = env.EMAIL_REPLY_TO ?? env.ADMIN_EMAIL ?? extractEmailAddress(from);
  const provider = env.EMAIL_PROVIDER ?? 'auto';

  const recordDelivery = async (entry: {
    recipientEmail: string;
    kind: string;
    provider: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }) => {
    logger.info(
      {
        recipientEmail: entry.recipientEmail,
        kind: entry.kind,
        provider: entry.provider,
        status: entry.status,
        providerMessageId: entry.providerMessageId ?? undefined,
      },
      'Email delivery attempt',
    );
    const maybeLog = (
      prisma as unknown as {
        emailDeliveryLog?: { create?: (args: unknown) => Promise<unknown> };
      }
    )?.emailDeliveryLog;
    if (maybeLog?.create) {
      await maybeLog
        .create({
          data: {
            recipientEmail: entry.recipientEmail.toLowerCase(),
            kind: entry.kind,
            provider: entry.provider,
            status: entry.status,
            providerMessageId: entry.providerMessageId ?? null,
            errorMessage: entry.errorMessage ? entry.errorMessage.slice(0, 480) : null,
          },
        })
        .catch(() => undefined);
    }
  };

  const canUseResend =
    Boolean(env.RESEND_API_KEY) && (provider === 'auto' || provider === 'resend');
  if (canUseResend && env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    const send = async (
      to: string,
      kind: string,
      payload: { subject: string; text: string; html: string },
    ) => {
      try {
        const { data, error } = await resend.emails.send({
          from,
          to,
          replyTo,
          ...payload,
        });
        if (error) {
          await recordDelivery({
            recipientEmail: to,
            kind,
            provider: 'resend',
            status: 'failed',
            errorMessage: error.message,
          });
          throw new Error(error.message);
        }
        await recordDelivery({
          recipientEmail: to,
          kind,
          provider: 'resend',
          status: 'sent',
          providerMessageId: data?.id ?? null,
        });
      } catch (err) {
        if (err instanceof Error) {
          logger.error({ err }, 'Resend failed to send email');
        }
        throw err;
      }
    };
    return {
      sendVerificationEmail: (to, name, url) =>
        send(to, 'verify_email', verificationTemplate(name, url)),
      sendOtpEmail: ({ email, name, code }) => send(email, 'otp', otpTemplate(name, code)),
      sendPasswordResetEmail: (to, name, url) =>
        send(to, 'password_reset', resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) =>
        send(to, 'reminder', reminderTemplate(name, title, url)),
      sendClassReminderEmail: (params) =>
        send(params.to, 'reminder', classReminderTemplate(params)),
      sendExamReminderEmail: (params) => send(params.to, 'reminder', examReminderTemplate(params)),
    };
  }

  const canUseBrevo = Boolean(env.BREVO_API_KEY) && (provider === 'auto' || provider === 'brevo');
  if (canUseBrevo && env.BREVO_API_KEY) {
    const senderEmail = extractEmailAddress(from);
    const senderName = extractSenderName(from);
    const send = async (
      to: string,
      kind: string,
      payload: { subject: string; text: string; html: string },
    ) => {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY!,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          replyTo: { email: replyTo },
          subject: payload.subject,
          textContent: payload.text,
          htmlContent: payload.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const msg = `Brevo failed (${res.status}): ${errText || 'Unknown error'}`;
        await recordDelivery({
          recipientEmail: to,
          kind,
          provider: 'brevo',
          status: 'failed',
          errorMessage: msg,
        });
        logger.error({ status: res.status }, 'Brevo API failed to send email');
        throw new Error(msg);
      }
      const data = (await res.json().catch(() => ({}))) as { messageId?: string };
      await recordDelivery({
        recipientEmail: to,
        kind,
        provider: 'brevo',
        status: 'sent',
        providerMessageId: data.messageId ?? null,
      });
    };
    return {
      sendVerificationEmail: (to, name, url) =>
        send(to, 'verify_email', verificationTemplate(name, url)),
      sendOtpEmail: ({ email, name, code }) => send(email, 'otp', otpTemplate(name, code)),
      sendPasswordResetEmail: (to, name, url) =>
        send(to, 'password_reset', resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) =>
        send(to, 'reminder', reminderTemplate(name, title, url)),
      sendClassReminderEmail: (params) =>
        send(params.to, 'reminder', classReminderTemplate(params)),
      sendExamReminderEmail: (params) => send(params.to, 'reminder', examReminderTemplate(params)),
    };
  }

  const canUseSmtp = Boolean(env.SMTP_URL) && (provider === 'auto' || provider === 'smtp');
  if (canUseSmtp && env.SMTP_URL) {
    const transporter = nodemailer.createTransport(env.SMTP_URL);
    const send = async (
      to: string,
      kind: string,
      payload: { subject: string; text: string; html: string },
    ) => {
      try {
        const info = await transporter.sendMail({ from, to, replyTo, ...payload });
        await recordDelivery({
          recipientEmail: to,
          kind,
          provider: 'smtp',
          status: 'sent',
          providerMessageId: info.messageId ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SMTP error';
        await recordDelivery({
          recipientEmail: to,
          kind,
          provider: 'smtp',
          status: 'failed',
          errorMessage: msg,
        });
        throw err;
      }
    };
    return {
      sendVerificationEmail: (to, name, url) =>
        send(to, 'verify_email', verificationTemplate(name, url)),
      sendOtpEmail: ({ email, name, code }) => send(email, 'otp', otpTemplate(name, code)),
      sendPasswordResetEmail: (to, name, url) =>
        send(to, 'password_reset', resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) =>
        send(to, 'reminder', reminderTemplate(name, title, url)),
      sendClassReminderEmail: (params) =>
        send(params.to, 'reminder', classReminderTemplate(params)),
      sendExamReminderEmail: (params) => send(params.to, 'reminder', examReminderTemplate(params)),
    };
  }

  const emailJsConfigured = Boolean(
    env.EMAILJS_SERVICE_ID &&
    env.EMAILJS_TEMPLATE_ID &&
    env.EMAILJS_PUBLIC_KEY &&
    env.EMAILJS_PRIVATE_KEY,
  );
  if (emailJsConfigured && (provider === 'auto' || provider === 'emailjs')) {
    const postEmailJs = async (
      to: string,
      kind: string,
      templateParams: Record<string, string>,
      templateId: string = env.EMAILJS_TEMPLATE_ID!,
    ) => {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: env.EMAILJS_SERVICE_ID,
          template_id: templateId,
          user_id: env.EMAILJS_PUBLIC_KEY,
          accessToken: env.EMAILJS_PRIVATE_KEY,
          template_params: {
            reply_to: replyTo,
            ...templateParams,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const msg = `EmailJS failed (${res.status}): ${text || 'Unknown error'}`;
        await recordDelivery({
          recipientEmail: to,
          kind,
          provider: 'emailjs',
          status: 'failed',
          errorMessage: msg,
        });
        logger.error({ status: res.status, body: text }, 'EmailJS REST API failed to send email');
        throw new Error(msg);
      }
      await recordDelivery({
        recipientEmail: to,
        kind,
        provider: 'emailjs',
        status: 'sent',
      });
    };
    return {
      sendVerificationEmail: (to, name, url) => {
        const payload = verificationTemplate(name, url);
        return postEmailJs(to, 'verify_email', {
          to_email: to,
          to_name: name,
          subject: payload.subject,
          message: payload.text,
          action_url: url,
          app_name: 'LearnSpace',
        });
      },
      sendOtpEmail: ({ email, name, code }) => {
        const payload = otpTemplate(name, code);
        return postEmailJs(email, 'otp', {
          to_email: email,
          to_name: name,
          subject: payload.subject,
          message: payload.text,
          otp_code: code,
          expiry_minutes: String(OTP_EXPIRY_MINUTES),
          app_name: 'LearnSpace',
        });
      },
      sendPasswordResetEmail: (to, name, url) => {
        const payload = resetTemplate(name, url);
        return postEmailJs(
          to,
          'password_reset',
          {
            to_email: to,
            to_name: name,
            subject: payload.subject,
            message: payload.text,
            reset_url: url,
            action_url: url,
            app_name: 'LearnSpace',
          },
          env.EMAILJS_RESET_TEMPLATE_ID ?? env.EMAILJS_TEMPLATE_ID!,
        );
      },
      sendTaskReminderEmail: (to, name, title, url) => {
        const payload = reminderTemplate(name, title, url);
        return postEmailJs(to, 'reminder', {
          to_email: to,
          to_name: name,
          subject: payload.subject,
          message: payload.text,
          app_name: 'LearnSpace',
        });
      },
      sendClassReminderEmail: (params) => {
        const payload = classReminderTemplate(params);
        return postEmailJs(params.to, 'reminder', {
          to_email: params.to,
          to_name: params.name,
          subject: payload.subject,
          message: payload.text,
          app_name: 'LearnSpace',
        });
      },
      sendExamReminderEmail: (params) => {
        const payload = examReminderTemplate(params);
        return postEmailJs(params.to, 'reminder', {
          to_email: params.to,
          to_name: params.name,
          subject: payload.subject,
          message: payload.text,
          app_name: 'LearnSpace',
        });
      },
    };
  }

  return {
    async sendVerificationEmail(to) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped verification email',
      );
      await recordDelivery({
        recipientEmail: to,
        kind: 'verify_email',
        provider: 'none',
        status: 'failed',
        errorMessage: 'No email provider configured on the server.',
      });
    },
    async sendOtpEmail({ email }) {
      logger.warn(
        { to: email },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped OTP email',
      );
      await recordDelivery({
        recipientEmail: email,
        kind: 'otp',
        provider: 'none',
        status: 'failed',
        errorMessage: 'No email provider configured on the server.',
      });
      throw new Error('No email provider configured on the server.');
    },
    async sendPasswordResetEmail(to) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped reset email',
      );
    },
    async sendTaskReminderEmail(to) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped reminder email',
      );
    },
    async sendClassReminderEmail({ to }) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped class reminder email',
      );
    },
    async sendExamReminderEmail({ to }) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, BREVO_API_KEY, SMTP_URL, or EMAILJS_*); skipped exam reminder email',
      );
    },
  };
}
