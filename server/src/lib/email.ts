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
    | 'EMAIL_FROM'
    | 'SMTP_URL'
    | 'EMAILJS_SERVICE_ID'
    | 'EMAILJS_TEMPLATE_ID'
    | 'EMAILJS_RESET_TEMPLATE_ID'
    | 'EMAILJS_PUBLIC_KEY'
    | 'EMAILJS_PRIVATE_KEY'
  >,
  logger: Logger,
): EmailService {
  const from = env.EMAIL_FROM ?? 'LearnSpace <no-reply@learnspace.local>';
  const provider = env.EMAIL_PROVIDER ?? 'auto';

  const canUseResend =
    Boolean(env.RESEND_API_KEY) && (provider === 'auto' || provider === 'resend');
  if (canUseResend && env.RESEND_API_KEY) {
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
      sendOtpEmail: ({ email, name, code }) =>
        send(email, {
          subject: 'Your LearnSpace verification code',
          text: `Hi ${name},\n\nYour LearnSpace verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
          html: `<p>Hi ${escapeHtml(name)},</p><p>Your LearnSpace verification code is <strong>${escapeHtml(code)}</strong>. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
        }),
      sendPasswordResetEmail: (to, name, url) => send(to, resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) => send(to, reminderTemplate(name, title, url)),
      sendClassReminderEmail: (params) => send(params.to, classReminderTemplate(params)),
      sendExamReminderEmail: (params) => send(params.to, examReminderTemplate(params)),
    };
  }

  const canUseSmtp = Boolean(env.SMTP_URL) && (provider === 'auto' || provider === 'smtp');
  if (canUseSmtp && env.SMTP_URL) {
    const transporter = nodemailer.createTransport(env.SMTP_URL);
    const send = async (to: string, payload: { subject: string; text: string; html: string }) => {
      await transporter.sendMail({ from, to, ...payload });
    };
    return {
      sendVerificationEmail: (to, name, url) => send(to, verificationTemplate(name, url)),
      sendOtpEmail: ({ email, name, code }) =>
        send(email, {
          subject: 'Your LearnSpace verification code',
          text: `Hi ${name},\n\nYour LearnSpace verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
          html: `<p>Hi ${escapeHtml(name)},</p><p>Your LearnSpace verification code is <strong>${escapeHtml(code)}</strong>. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
        }),
      sendPasswordResetEmail: (to, name, url) => send(to, resetTemplate(name, url)),
      sendTaskReminderEmail: (to, name, title, url) => send(to, reminderTemplate(name, title, url)),
      sendClassReminderEmail: (params) => send(params.to, classReminderTemplate(params)),
      sendExamReminderEmail: (params) => send(params.to, examReminderTemplate(params)),
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
          template_params: templateParams,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error({ status: res.status, body: text }, 'EmailJS REST API failed to send email');
        throw new Error(`EmailJS failed (${res.status}): ${text || 'Unknown error'}`);
      }
    };
    return {
      sendVerificationEmail: (to, name, url) => {
        const payload = verificationTemplate(name, url);
        return postEmailJs({
          to_email: to,
          to_name: name,
          subject: payload.subject,
          message: payload.text,
          action_url: url,
          app_name: 'LearnSpace',
        });
      },
      sendOtpEmail: ({ email, name, code }) =>
        postEmailJs({
          to_email: email,
          to_name: name,
          otp_code: code,
          expiry_minutes: String(OTP_EXPIRY_MINUTES),
        }),
      sendPasswordResetEmail: (to, name, url) => {
        const payload = resetTemplate(name, url);
        return postEmailJs(
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
        return postEmailJs({
          to_email: to,
          to_name: name,
          subject: payload.subject,
          message: payload.text,
          app_name: 'LearnSpace',
        });
      },
      sendClassReminderEmail: (params) => {
        const payload = classReminderTemplate(params);
        return postEmailJs({
          to_email: params.to,
          to_name: params.name,
          subject: payload.subject,
          message: payload.text,
          app_name: 'LearnSpace',
        });
      },
      sendExamReminderEmail: (params) => {
        const payload = examReminderTemplate(params);
        return postEmailJs({
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
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped verification email',
      );
    },
    async sendOtpEmail({ email }) {
      logger.warn(
        { to: email },
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped OTP email',
      );
    },
    async sendPasswordResetEmail(to) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped reset email',
      );
    },
    async sendTaskReminderEmail(to) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped reminder email',
      );
    },
    async sendClassReminderEmail({ to }) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped class reminder email',
      );
    },
    async sendExamReminderEmail({ to }) {
      logger.warn(
        { to },
        'Email not configured (set RESEND_API_KEY, SMTP_URL, or EMAILJS_*); skipped exam reminder email',
      );
    },
  };
}
