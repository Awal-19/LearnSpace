import { MailWarning, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { useAuth } from '../AuthContext';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function VerifyEmailBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      await request('/auth/resend-verification', { method: 'POST' });
      toast.show({
        kind: 'success',
        title: 'Verification email sent',
        description: `Check ${user.email} for the link.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not send email',
        description: err instanceof ApiError ? err.message : 'Please try again shortly.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2.5">
        <MailWarning className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <p>
          Verify your email (<strong>{user.email}</strong>) to unlock the AI Study Assistant and
          email reminders.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" loading={sending} onClick={resend}>
          Resend email
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss verification reminder"
          className="rounded-md p-1.5 text-muted hover:bg-surface2 hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Authenticated shell: sidebar on desktop, bottom tabs on mobile, content in the middle. */
export function AppLayout({ base = '' }: { base?: string }) {
  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-sidebar">
        <TopBar base={base} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-content animate-fade-up px-4 py-6 pb-28 outline-none sm:px-6 lg:pb-10"
        >
          <VerifyEmailBanner />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
