import { describe, expect, it, vi } from 'vitest';
import { REDACT_PATHS } from '../../src/lib/logger';
import { recordAnomalySignal, scrubSensitiveData } from '../../src/lib/securityMonitor';

describe('securityMonitor & log redaction', () => {
  it('includes OTP, API key, secret, and step-up headers in Pino REDACT_PATHS', () => {
    expect(REDACT_PATHS).toContain('*.otp');
    expect(REDACT_PATHS).toContain('*.apiKey');
    expect(REDACT_PATHS).toContain('req.headers["x-step-up-password"]');
  });

  it('recursively scrubs sensitive fields before external error reporting', () => {
    const scrubbed = scrubSensitiveData({
      route: '/api/v1/auth/login',
      headers: {
        authorization: 'Bearer secret-jwt',
        'x-step-up-password': 'my-password',
      },
      body: {
        password: 'Password123!',
        otp: '123456',
      },
    }) as Record<string, unknown>;

    expect((scrubbed.headers as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect((scrubbed.headers as Record<string, unknown>)['x-step-up-password']).toBe('[REDACTED]');
    expect((scrubbed.body as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((scrubbed.body as Record<string, unknown>).otp).toBe('[REDACTED]');
    expect(scrubbed.route).toBe('/api/v1/auth/login');
  });

  it('emits a security anomaly alert when repeated failed-login threshold is reached', () => {
    const errorMock = vi.fn();
    const logger = { error: errorMock };
    for (let i = 0; i < 9; i += 1) {
      expect(recordAnomalySignal(logger, 'failed_login_ip', '10.0.0.99')).toBe(false);
    }
    expect(recordAnomalySignal(logger, 'failed_login_ip', '10.0.0.99')).toBe(true);
    expect(errorMock).toHaveBeenCalledTimes(1);
  });
});
