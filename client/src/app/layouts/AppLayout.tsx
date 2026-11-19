import { AlertTriangle, MailWarning, Megaphone, MessageSquarePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation } from 'react-router-dom';
import { Button, Input, Modal, Textarea, useToast } from '../../design';
import { fetchActiveAnnouncements, submitStudentFeedback } from '../../features/admin/adminApi';
import { ApiError, request } from '../../lib/apiClient';
import { isEmailJsConfigured, sendEmail } from '../../services/email';
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

function AnnouncementsAndMaintenanceBanner() {
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});
  const { data } = useQuery({
    queryKey: ['student-announcements'],
    queryFn: fetchActiveAnnouncements,
    staleTime: 60_000,
    retry: false,
  });

  if (!data) return null;

  const visibleAnnouncements = data.announcements.filter((a) => !dismissedIds[a.id]);

  return (
    <>
      {data.maintenanceMode && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="font-medium text-fg">Scheduled maintenance</p>
            <p className="mt-0.5 text-muted">
              {data.maintenanceMessage || 'Some features may be temporarily unavailable.'}
            </p>
          </div>
        </div>
      )}
      {visibleAnnouncements.map((item) => (
        <div
          key={item.id}
          role="region"
          aria-label={`Announcement: ${item.title}`}
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm"
        >
          <div className="flex items-start gap-3">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="font-medium text-fg">{item.title}</p>
              <p className="mt-0.5 text-muted">{item.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedIds((prev) => ({ ...prev, [item.id]: true }))}
            aria-label={`Dismiss ${item.title}`}
            className="rounded-md p-1.5 text-muted hover:bg-surface2 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </>
  );
}

function FeedbackWidget() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'bug' | 'suggestion' | 'abuse'>('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hiddenMobile, setHiddenMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const nextY = window.scrollY;
      setHiddenMobile(nextY > lastY && nextY > 80);
      lastY = nextY;
    };
    const vv = window.visualViewport;
    const onViewport = () => {
      if (!vv) return;
      const keyboardOpen = window.innerHeight - vv.height > 120;
      if (keyboardOpen) setHiddenMobile(true);
      else if (window.scrollY <= 80) setHiddenMobile(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    vv?.addEventListener('resize', onViewport);
    return () => {
      window.removeEventListener('scroll', onScroll);
      vv?.removeEventListener('resize', onViewport);
    };
  }, []);

  const COOLDOWN_MS = 30_000;
  const COOLDOWN_KEY = 'learnspace_feedback_last_sent_at';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot.trim()) {
      // Silently ignore automated bot submissions that fill the hidden honeypot field
      setOpen(false);
      return;
    }
    const lastSent = Number(window.localStorage.getItem(COOLDOWN_KEY) ?? '0');
    const remainingMs = COOLDOWN_MS - (Date.now() - lastSent);
    if (remainingMs > 0) {
      toast.show({
        kind: 'info',
        dedupeKey: 'feedback-cooldown',
        title: 'Please wait a moment',
        description: `You can send another message in ${Math.ceil(remainingMs / 1000)}s.`,
      });
      return;
    }
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await submitStudentFeedback({
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      if (isEmailJsConfigured()) {
        await sendEmail({
          from_name: user?.name ?? 'LearnSpace Student',
          from_email: user?.email ?? 'student@learnspace.local',
          category,
          subject: subject.trim(),
          message: message.trim(),
          app_name: 'LearnSpace',
        }).catch(() => undefined);
      }
      window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      toast.show({
        kind: 'success',
        title: 'Feedback submitted',
        description: 'Thank you for helping us improve LearnSpace.',
      });
      setSubject('');
      setMessage('');
      setHoneypot('');
      setCategory('suggestion');
      setOpen(false);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not submit feedback',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-30 inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-white/85 bg-white/85 text-xs font-medium text-fg shadow-md backdrop-blur-md transition-all hover:border-primary-300 hover:bg-white dark:border-line dark:bg-surface dark:hover:bg-surface2 lg:bottom-5 lg:right-6 lg:h-auto lg:w-auto lg:px-3.5 lg:py-2 ${
          hiddenMobile
            ? 'pointer-events-none translate-y-4 opacity-0 lg:pointer-events-auto lg:translate-y-0 lg:opacity-100'
            : 'opacity-100'
        }`}
      >
        <MessageSquarePlus
          className="h-4 w-4 text-primary-600 dark:text-primary-400"
          aria-hidden="true"
        />
        <span className="hidden lg:inline">Feedback</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Send Feedback or Report">
        <form onSubmit={submit} className="space-y-4">
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="feedback-website">Website</label>
            <input
              id="feedback-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="feedback-category"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Category
            </label>
            <select
              id="feedback-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as 'bug' | 'suggestion' | 'abuse')}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              <option value="suggestion">Suggestion</option>
              <option value="bug">Bug report</option>
              <option value="abuse">Abuse / safety report</option>
            </select>
          </div>
          <div>
            <Input
              id="feedback-subject"
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              maxLength={140}
              required
            />
          </div>
          <div>
            <Textarea
              id="feedback-message"
              label="Details"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what happened or what you would like to see..."
              rows={4}
              maxLength={2000}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit feedback
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Authenticated shell: sidebar on desktop, bottom tabs on mobile, content in the middle. */
export function AppLayout({ base = '' }: { base?: string }) {
  const { pathname } = useLocation();
  const relPath = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const isChatRoute = relPath === '/chat' || relPath.startsWith('/chat/');

  return (
    <div
      className={
        isChatRoute
          ? 'relative h-dvh min-h-dvh overflow-hidden bg-app'
          : 'relative min-h-screen overflow-x-clip bg-app'
      }
    >
      {/* Subtle top-right frosted blue ribbon ambience matching the calm workspace shell */}
      <svg
        aria-hidden="true"
        viewBox="0 0 720 320"
        className="pointer-events-none fixed right-0 top-0 z-0 h-[280px] w-[620px] opacity-65 dark:opacity-15"
      >
        <defs>
          <linearGradient id="appShellWave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EFF6FF" stopOpacity="0" />
            <stop offset="55%" stopColor="#DBEAFE" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <path
          d="M120,0 C240,120 420,90 540,210 C610,275 675,295 720,305 L720,0 Z"
          fill="url(#appShellWave)"
        />
        <path
          d="M270,0 C395,105 520,75 640,175 C680,208 702,228 720,242 L720,0 Z"
          fill="url(#appShellWave)"
        />
      </svg>

      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div
        className={
          isChatRoute
            ? 'relative z-10 flex h-full flex-col lg:pl-sidebar'
            : 'relative z-10 lg:pl-sidebar'
        }
      >
        <TopBar base={base} />
        <main
          id="main-content"
          tabIndex={-1}
          className={
            isChatRoute
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden pb-16 outline-none lg:pb-0'
              : 'mx-auto w-full max-w-content animate-fade-up px-4 py-6 pb-28 outline-none sm:px-6 lg:pb-10'
          }
        >
          {isChatRoute ? (
            <div className="shrink-0 px-4 pt-3 empty:hidden sm:px-6">
              <AnnouncementsAndMaintenanceBanner />
              <VerifyEmailBanner />
            </div>
          ) : (
            <>
              <AnnouncementsAndMaintenanceBanner />
              <VerifyEmailBanner />
            </>
          )}
          <Outlet />
        </main>
      </div>
      {!isChatRoute ? <FeedbackWidget /> : null}
      <BottomNav />
    </div>
  );
}
