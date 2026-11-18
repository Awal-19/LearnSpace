import 'dotenv/config';
import { loadEnv } from '../src/config/env';
import { createEmailService } from '../src/lib/email';
import { createLogger } from '../src/lib/logger';

async function main() {
  const targetEmail = process.argv[2]?.trim();
  if (!targetEmail) {
    console.error('Usage: npm run email:test -w server -- recipient@example.com');
    process.exit(1);
  }

  const env = loadEnv(process.env);
  const logger = createLogger(env);
  const email = createEmailService(env, logger);

  await email.sendOtpEmail({
    email: targetEmail,
    name: targetEmail.split('@')[0] || 'Student',
    code: '123456',
  });

  console.warn(`Test OTP email dispatched to ${targetEmail} via provider "${env.EMAIL_PROVIDER}".`);
}

main().catch((err) => {
  console.error('Failed to send test email:', err instanceof Error ? err.message : err);
  process.exit(1);
});
