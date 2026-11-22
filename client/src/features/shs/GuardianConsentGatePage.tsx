import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MailCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Badge, Button, Card, Input, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

interface ConsentStatusResponse {
  ageGroup: 'adult_18_plus' | 'under_18';
  guardianConsentStatus: 'not_required' | 'pending' | 'given' | 'withdrawn';
  latestConsent: {
    id: string;
    status: string;
    guardianEmail: string;
    guardianPhone: string | null;
    createdAt: string;
    consentedAt: string | null;
    withdrawnAt: string | null;
  } | null;
}

export function GuardianConsentGatePage() {
  const { status, user, updateUser, logout } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [sending, setSending] = useState(false);

  const consentQuery = useQuery({
    queryKey: ['shs', 'consent-status'],
    queryFn: () => request<ConsentStatusResponse>('/shs/consent/status'),
    enabled: status === 'authenticated' && Boolean(user?.emailVerified),
  });

  if (status === 'loading') return null;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (!user?.emailVerified) return <Navigate to="/verify-email" replace />;
  if (user.ageGroup !== 'under_18' || user.guardianConsentStatus === 'given') {
    return <Navigate to="/" replace />;
  }

  const currentStatus =
    consentQuery.data?.guardianConsentStatus ?? user.guardianConsentStatus ?? 'pending';
  const latestEmail = consentQuery.data?.latestConsent?.guardianEmail;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!guardianEmail.trim()) {
      toast.show({ kind: 'error', title: 'Enter a parent or guardian email address.' });
      return;
    }
    setSending(true);
    try {
      const res = await request<{ status: 'pending'; guardianEmail: string }>(
        '/shs/consent/request',
        {
          method: 'POST',
          body: {
            guardianEmail: guardianEmail.trim(),
            guardianPhone: guardianPhone.trim() || null,
          },
        },
      );
      await qc.invalidateQueries({ queryKey: ['shs', 'consent-status'] });
      toast.show({
        kind: 'success',
        title: 'Consent request sent',
        description: `We emailed an approval link to ${res.guardianEmail}.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not send consent request',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    const res = await consentQuery.refetch();
    if (res.data?.guardianConsentStatus === 'given') {
      updateUser({ ...user, guardianConsentStatus: 'given' });
      toast.show({ kind: 'success', title: 'Guardian consent approved!' });
    } else {
      toast.show({ kind: 'info', title: 'Still waiting for guardian approval.' });
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-fg">
                Parent or Guardian Permission Needed
              </h1>
              <Badge tone={currentStatus === 'withdrawn' ? 'danger' : 'warning'}>
                {currentStatus === 'withdrawn' ? 'Withdrawn' : 'Pending'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Because you are under 18, a parent or guardian must approve your LearnSpace account
              before you can open subjects, notes, or the AI tutor.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface2/50 p-3.5 text-xs text-muted space-y-1">
          <p className="font-medium text-fg">How we protect your privacy:</p>
          <p>
            Your profile is private by default, your name and school are hidden from other students,
            there are no ads, and private direct messages are disabled.
          </p>
        </div>

        {latestEmail ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary-200/70 bg-primary-50/50 px-3.5 py-2.5 text-xs text-fg dark:border-primary-500/20 dark:bg-primary-500/10">
            <MailCheck className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
            <span>
              Latest consent link sent to <strong>{latestEmail}</strong>. Ask your parent/guardian
              to open the link in their email.
            </span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Parent or guardian email"
            type="email"
            placeholder="parent@example.com"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            required
          />
          <Input
            label="Parent or guardian phone (optional)"
            type="tel"
            placeholder="e.g. 024 000 0000"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
          />
          <Button type="submit" loading={sending} className="w-full">
            {latestEmail ? 'Send new consent request' : 'Send consent request'}
          </Button>
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            I&apos;ve been approved
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
