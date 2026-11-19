import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthContext';
import { Button, GlassCard, Input, Modal, PasswordInput, Spinner, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchStepUpStatus, requestStepUpOtp, verifyStepUp } from './adminApi';

interface StepUpModalProps {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}

export function StepUpModal({
  open,
  title = 'Super Admin Verification Required',
  description = 'Re-enter your password or verify with a 6-digit email OTP to perform this sensitive action.',
  onClose,
  onVerified,
}: StepUpModalProps) {
  const toast = useToast();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestStepUpOtp();
      setOtpSent(true);
      toast.show({ kind: 'success', title: 'Verification code sent to your email' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyStepUp(mode === 'password' ? { password } : { code });
      setPassword('');
      setCode('');
      onClose();
      await onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <form onSubmit={handleVerify} className="space-y-4 p-5 pt-3 sm:p-6 sm:pt-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface2/60 p-3 text-xs text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
          <p>{description}</p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'password' ? 'primary' : 'secondary'}
            onClick={() => {
              setMode('password');
              setError(null);
            }}
          >
            Password
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'otp' ? 'primary' : 'secondary'}
            onClick={() => {
              setMode('otp');
              setError(null);
            }}
          >
            Email OTP
          </Button>
        </div>

        {mode === 'password' ? (
          <PasswordInput
            label="Current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            error={error ?? undefined}
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="6-digit OTP code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  error={error ?? undefined}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={handleSendOtp}
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                {otpSent ? 'Resend' : 'Send OTP'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Verify &amp; Continue
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function SuperAdminGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['admin', 'super', 'step-up-status', user?.id],
    queryFn: fetchStepUpStatus,
    enabled: user?.role === 'super_admin',
    staleTime: 60_000,
    retry: false,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!statusQuery.data?.verified) {
    const handleUnlock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password) return;
      setBusy(true);
      setError(null);
      try {
        await verifyStepUp({ password });
        setPassword('');
        await qc.invalidateQueries({ queryKey: ['admin', 'super'] });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Incorrect admin password');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <GlassCard className="w-full max-w-md p-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-600">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-center font-display text-xl font-semibold">
            Super Admin Password Required
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            Enter your admin password to access Super Admin controls.
          </p>
          <form onSubmit={handleUnlock} className="mt-5 space-y-4">
            <PasswordInput
              label="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              required
              error={error ?? undefined}
            />
            <Button type="submit" className="w-full" loading={busy}>
              Unlock Super Admin
            </Button>
          </form>
        </GlassCard>
      </div>
    );
  }

  return <>{children}</>;
}
