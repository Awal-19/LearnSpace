import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

export function GuardianConsentActionPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const action = params.get('action') === 'withdraw' ? 'withdraw' : 'approve';

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ status: 'given' | 'withdrawn'; studentName: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!token) {
      setError('Missing consent token.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = action === 'withdraw' ? '/shs/consent/withdraw' : '/shs/consent/approve';
      const res = await request<{ status: 'given' | 'withdrawn'; studentName: string }>(endpoint, {
        method: 'POST',
        body: { token },
        auth: false,
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full space-y-5 p-6 sm:p-8">
        {done ? (
          <div className="space-y-4 text-center">
            {done.status === 'given' ? (
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            ) : (
              <XCircle className="mx-auto h-12 w-12 text-danger" />
            )}
            <h1 className="font-display text-xl font-bold text-fg">
              {done.status === 'given' ? 'Guardian Consent Approved' : 'Guardian Consent Withdrawn'}
            </h1>
            <p className="text-sm text-muted">
              {done.status === 'given'
                ? `Thank you. ${done.studentName}'s LearnSpace account is now active with under-18 privacy protections enabled.`
                : `Consent for ${done.studentName}'s LearnSpace account has been withdrawn and the account is now locked.`}
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl border border-line px-4 py-2 text-xs font-medium text-fg hover:border-primary-300"
            >
              Go to LearnSpace
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:text-primary-400">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-fg">
                  {action === 'withdraw' ? 'Withdraw Guardian Consent' : 'Approve Student Account'}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  {action === 'withdraw'
                    ? 'Confirming will immediately lock this student account so it can no longer access LearnSpace.'
                    : 'Confirming grants permission for this under-18 student to use LearnSpace with private-by-default settings, no ads, and no private direct messages.'}
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <Button
              type="button"
              variant={action === 'withdraw' ? 'danger' : 'primary'}
              loading={submitting}
              onClick={() => void handleConfirm()}
              className="w-full"
            >
              {action === 'withdraw' ? 'Confirm Withdraw Consent' : 'Approve Student Account'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
