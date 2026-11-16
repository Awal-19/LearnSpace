import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../design';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { ThemeProvider } from './ThemeProvider';
import { RequireAuth } from './RequireAuth';
import { routes } from './router';

const noop = () => undefined;

function makeAuth(partial: Pick<AuthContextValue, 'status' | 'user'>): AuthContextValue {
  return {
    ...partial,
    setSession: noop,
    updateUser: noop,
    clearSession: noop,
    logout: async () => undefined,
    markEmailVerified: noop,
  };
}

function renderAt(path: string, auth: Pick<AuthContextValue, 'status' | 'user'>) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AuthContext.Provider value={makeAuth(auth)}>
            <RouterProvider router={router} />
          </AuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return router;
}

describe('route protection (T-AUTH-15)', () => {
  it('redirects unauthenticated users to /login and remembers where they were going', () => {
    const router = renderAt('/notes?x=1', { status: 'unauthenticated', user: null });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/notes?x=1')}`);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows a loading state while the session is being restored (no flash of login)', () => {
    const router = renderAt('/', { status: 'loading', user: null });
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders the app shell for authenticated users', () => {
    renderAt('/', {
      status: 'authenticated',
      user: { id: 'u1', email: 'a@b.co', name: 'Test User', emailVerified: true, avatarUrl: null },
    });
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your profile' })).toBeInTheDocument();
  });

  it('shows the 404 page for unknown routes', () => {
    renderAt('/definitely-not-here', { status: 'unauthenticated', user: null });
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('RequireAuth is exported for reuse', () => {
    expect(RequireAuth).toBeTypeOf('function');
  });
});

