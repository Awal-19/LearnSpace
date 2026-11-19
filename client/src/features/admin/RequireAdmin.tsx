import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../app/AuthContext';
import { Button, GlassCard, Input, PasswordInput, Spinner } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { fetchAdminConsoleStatus, unlockAdminConsole } from './adminApi';

interface AdminLoginResponse {
  accessToken?: string;
  user?: AuthUser;
  requiresTwoFactor?: boolean;
  email?: string;
}

export function RequireAdmin() {
  const { user, status, setSession, logout } = useAuth();
  const queryClient = useQueryClient();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [twoFactorEmail, setTwoFactorEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [consolePassword, setConsolePassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const unlockQuery = useQuery({
    queryKey: ['admin-console-unlock', user?.id],
    queryFn: fetchAdminConsoleStatus,
    enabled: status === 'authenticated' && isAdmin,
    retry: false,
  });

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <Spinner />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginBusy(true);
      setLoginError(null);
      try {
        const res = await request<AdminLoginResponse>('/auth/login', {
          method: 'POST',
          body: { email: loginEmail.trim(), password: loginPassword, rememberMe: false },
          auth: false,
          cookie: true,
        });
        if (res.requiresTwoFactor && res.email) {
          setTwoFactorEmail(res.email);
          return;
        }
        if (res.accessToken && res.user) {
          if (res.user.role !== 'admin' && res.user.role !== 'super_admin') {
            setLoginError('This account does not have administrator privileges.');
            return;
          }
          setSession(res.accessToken, res.user);
        }
      } catch (err) {
        setLoginError(err instanceof ApiError ? err.message : 'Invalid credentials.');
      } finally {
        setLoginBusy(false);
      }
    };

    const handleVerify2fa = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!twoFactorEmail) return;
      setLoginBusy(true);
      setLoginError(null);
      try {
        const res = await request<AdminLoginResponse>('/auth/admin-2fa/verify', {
          method: 'POST',
          body: { email: twoFactorEmail, code: otpCode.trim() },
          auth: false,
          cookie: true,
        });
        if (res.accessToken && res.user) {
          setSession(res.accessToken, res.user);
        }
      } catch (err) {
        setLoginError(err instanceof ApiError ? err.message : 'Invalid verification code.');
      } finally {
        setLoginBusy(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-app bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.12),transparent_60%)] p-6">
        <GlassCard className="w-full max-w-md p-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-600">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-center font-display text-xl font-semibold">
            LearnSpace Admin Sign In
          </h1>
          <p className="mt-1 text-center text-sm text-muted">
            Sign in directly to the Admin Console.
          </p>

          {twoFactorEmail ? (
            <form onSubmit={handleVerify2fa} className="mt-5 space-y-4">
              <Input
                label="6-digit email OTP"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                error={loginError ?? undefined}
              />
              <Button type="submit" className="w-full" loading={loginBusy}>
                Verify &amp; Continue
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <Input
                label="Admin email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="awalsarpong4@gmail.com"
                required
              />
              <PasswordInput
                label="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                required
                error={loginError ?? undefined}
              />
              <Button type="submit" className="w-full" loading={loginBusy}>
                Sign in to Admin Console
              </Button>
            </form>
          )}
        </GlassCard>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.12),transparent_60%)] p-6">
        <GlassCard className="max-w-md p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold">403 — Access Denied</h1>
          <p className="mt-2 text-sm text-muted">
            You are currently signed in as a student ({user?.email}). Sign in with an administrator
            account to access the Admin Console.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/">
              <Button size="sm" variant="secondary">
                Back to LearnSpace
              </Button>
            </Link>
            <Button size="sm" onClick={() => void logout()}>
              Sign in as Admin
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (unlockQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <Spinner />
      </div>
    );
  }

  if (unlockQuery.data?.required && !unlockQuery.data.unlocked) {
    const handleUnlock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!consolePassword) return;
      setUnlockBusy(true);
      setUnlockError(null);
      try {
        await unlockAdminConsole(consolePassword);
        setConsolePassword('');
        await queryClient.invalidateQueries({ queryKey: ['admin-console-unlock', user?.id] });
      } catch (err) {
        setUnlockError(err instanceof ApiError ? err.message : 'Incorrect admin console password');
      } finally {
        setUnlockBusy(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-app bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.12),transparent_60%)] p-6">
        <GlassCard className="w-full max-w-md p-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-center font-display text-xl font-semibold">
            Admin Console Password
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            Enter the admin console password to continue.
          </p>
          <form onSubmit={handleUnlock} className="mt-5 space-y-4">
            <PasswordInput
              label="Console password"
              value={consolePassword}
              onChange={(e) => setConsolePassword(e.target.value)}
              placeholder="Enter admin password"
              required
              error={unlockError ?? undefined}
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void logout()}
                className="text-xs text-muted hover:text-fg"
              >
                Switch account
              </button>
              <Button type="submit" loading={unlockBusy}>
                Unlock Console
              </Button>
            </div>
          </form>
        </GlassCard>
      </div>
    );
  }

  return <Outlet />;
}
