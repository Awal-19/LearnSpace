import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, request, setAccessToken, setRefreshHandler } from '../lib/apiClient';
import type { AvatarConfig } from '../features/profile/avatarTypes';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role?: 'student' | 'admin' | 'super_admin';
  status?: 'active' | 'suspended';
  twoFactorEnabled?: boolean;
  studentId?: string | null;
  programme?: string | null;
  level?: string | null;
  university?: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  avatarConfig?: AvatarConfig | null;
  hasPassword?: boolean;
  termsAccepted?: boolean;
  termsVersion?: string | null;
  termsAcceptedAt?: string | null;
  privacyPolicyVersion?: string | null;
  privacyPolicyAcceptedAt?: string | null;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  markEmailVerified: () => void;
}

const noop = () => undefined;

export const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  user: null,
  setSession: noop,
  updateUser: noop,
  clearSession: noop,
  logout: async () => undefined,
  markEmailVerified: noop,
});

export interface RefreshResponse {
  accessToken: string;
  user: AuthUser;
}

/**
 * One in-flight refresh at a time. React StrictMode double-runs effects in dev, and
 * refresh tokens rotate on every use, so concurrent calls must share a single request.
 */
let inflight: Promise<RefreshResponse | null> | null = null;

export function restoreSession(): Promise<RefreshResponse | null> {
  inflight ??= request<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    auth: false,
    cookie: true,
  })
    .catch((err: unknown) => {
      if (err instanceof ApiError) return null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>({
    status: 'loading',
    user: null,
  });

  const setSession = useCallback((accessToken: string, user: AuthUser) => {
    setAccessToken(accessToken);
    setState({ status: 'authenticated', user });
  }, []);

  const updateUser = useCallback((user: AuthUser) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setState({ status: 'unauthenticated', user: null });
  }, []);

  const logout = useCallback(async () => {
    try {
      await request('/auth/logout', { method: 'POST', auth: false, cookie: true });
    } catch {
      /* clear local state even if network fails */
    }
    clearSession();
  }, [clearSession]);

  const markEmailVerified = useCallback(() => {
    setState((prev) =>
      prev.user ? { ...prev, user: { ...prev.user, emailVerified: true } } : prev,
    );
  }, []);

  useEffect(() => {
    setRefreshHandler(async () => {
      try {
        const session = await restoreSession();
        if (session) {
          setSession(session.accessToken, session.user);
          return true;
        }
      } catch {
        /* network failure */
      }
      clearSession();
      return false;
    });
    return () => setRefreshHandler(null);
  }, [clearSession, setSession]);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setSession(session.accessToken, session.user);
        } else {
          clearSession();
        }
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession, setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      setSession,
      updateUser,
      clearSession,
      logout,
      markEmailVerified,
    }),
    [state, setSession, updateUser, clearSession, logout, markEmailVerified],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
