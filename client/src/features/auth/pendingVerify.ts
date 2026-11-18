const PENDING_EMAIL_KEY = 'learnspace_pending_verify_email';

export function setPendingVerifyEmail(email: string): void {
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* ignore storage errors */
  }
}

export function getPendingVerifyEmail(): string {
  try {
    return window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearPendingVerifyEmail(): void {
  try {
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  return `${local[0]}***${domain}`;
}
