import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailService, otpTemplate } from '../../src/lib/email';

describe('email service, templates & provider switching', () => {
  const logger = pino({ level: 'silent' });
  const baseEnv = {
    EMAIL_PROVIDER: 'auto' as const,
    RESEND_API_KEY: undefined,
    BREVO_API_KEY: undefined,
    EMAIL_FROM: 'LearnSpace <no-reply@learnspace.app>',
    EMAIL_REPLY_TO: 'support@learnspace.app',
    ADMIN_EMAIL: 'admin@learnspace.app',
    SMTP_URL: undefined,
    EMAILJS_SERVICE_ID: undefined,
    EMAILJS_TEMPLATE_ID: undefined,
    EMAILJS_RESET_TEMPLATE_ID: undefined,
    EMAILJS_PUBLIC_KEY: undefined,
    EMAILJS_PRIVATE_KEY: undefined,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds multipart HTML and plain-text OTP emails without spammy content', () => {
    const tpl = otpTemplate('Ama', '482910');
    expect(tpl.subject).toBe('Your LearnSpace verification code');
    expect(tpl.text).toContain('LearnSpace');
    expect(tpl.text).toContain('482910');
    expect(tpl.text).toContain('10 minutes');
    expect(tpl.text).toContain('safely ignore this email');
    expect(tpl.html).toContain('482910');
    expect(tpl.html).toContain('LearnSpace');
  });

  it('switches to Brevo provider via EMAIL_PROVIDER=brevo and logs delivery without the OTP code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: '<brevo-123>' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const deliveryLogs: Array<Record<string, unknown>> = [];
    const prismaMock = {
      emailDeliveryLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          deliveryLogs.push(data);
          return data;
        },
      },
    } as never;

    const svc = createEmailService(
      {
        ...baseEnv,
        EMAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: 'xkeysib-test-key',
      },
      logger,
      prismaMock,
    );

    await svc.sendOtpEmail({ email: 'ama@ug.edu.gh', name: 'Ama', code: '654321' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.replyTo.email).toBe('support@learnspace.app');
    expect(body.textContent).toContain('654321');
    expect(body.htmlContent).toContain('654321');

    expect(deliveryLogs).toHaveLength(1);
    expect(deliveryLogs[0]).toMatchObject({
      recipientEmail: 'ama@ug.edu.gh',
      kind: 'otp',
      provider: 'brevo',
      status: 'sent',
      providerMessageId: '<brevo-123>',
    });
    expect(JSON.stringify(deliveryLogs[0])).not.toContain('654321');
  });

  it('logs failed EmailJS responses and throws a clear error instead of failing silently', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'API calls are disabled for non-browser applications',
    });
    vi.stubGlobal('fetch', fetchMock);

    const deliveryLogs: Array<Record<string, unknown>> = [];
    const prismaMock = {
      emailDeliveryLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          deliveryLogs.push(data);
          return data;
        },
      },
    } as never;

    const svc = createEmailService(
      {
        ...baseEnv,
        EMAIL_PROVIDER: 'emailjs',
        EMAILJS_SERVICE_ID: 'svc_1',
        EMAILJS_TEMPLATE_ID: 'tpl_1',
        EMAILJS_PUBLIC_KEY: 'pub_1',
        EMAILJS_PRIVATE_KEY: 'priv_1',
      },
      logger,
      prismaMock,
    );

    await expect(
      svc.sendOtpEmail({ email: 'ama@ug.edu.gh', name: 'Ama', code: '112233' }),
    ).rejects.toThrow(/EmailJS failed \(403\)/);

    expect(deliveryLogs[0]).toMatchObject({
      provider: 'emailjs',
      status: 'failed',
    });
    expect(String(deliveryLogs[0]?.errorMessage)).toContain('403');
  });
});
