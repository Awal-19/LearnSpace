import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { request, setAccessToken, setRefreshHandler } from '../../lib/apiClient';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';

function renderWithAuth(ui: React.ReactNode, setSession = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    status: 'unauthenticated',
    user: null,
    setSession,
    updateUser: vi.fn(),
    clearSession: vi.fn(),
    logout: vi.fn(async () => undefined),
    markEmailVerified: vi.fn(),
  };

  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={ui} />
              <Route path="/" element={<div>Dashboard home</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { setSession };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setRefreshHandler(null);
});

describe('LoginPage (T-UI-01, T-UI-02, T-UI-03, T-UI-06)', () => {
  it('validates inline and shows errors on submit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ google: false }), { status: 200 })),
    );
    renderWithAuth(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('toggles password visibility with accessible state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ google: false }), { status: 200 })),
    );
    renderWithAuth(<LoginPage />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hides the Google button when google=false and shows it when google=true', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ google: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithAuth(<LoginPage />);

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('shows server errors in role="alert"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/providers')) {
          return new Response(JSON.stringify({ google: false }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
          }),
          { status: 401 },
        );
      }),
    );

    renderWithAuth(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'ama@uni.edu');
    await userEvent.type(screen.getByLabelText('Password'), 'WrongPass1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});

describe('SignupPage', () => {
  it('updates live password checklist as user types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ google: false }), { status: 200 })),
    );
    renderWithAuth(<SignupPage />);

    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'Passw0rdOK');

    await waitFor(() => {
      const items = screen.getByLabelText('Password requirements').querySelectorAll('li');
      expect(items.length).toBe(3);
      for (const item of items) {
        expect(item.className).toContain('text-success');
      }
    });
  });
});

describe('apiClient silent refresh (T-AUTH-16)', () => {
  it('refreshes once on TOKEN_EXPIRED and retries the original request', async () => {
    setAccessToken('expired-token');
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const refreshHandler = vi.fn(async () => {
      setAccessToken('fresh-token');
      return true;
    });
    setRefreshHandler(refreshHandler);

    const result = await request<{ ok: boolean }>('/users/me');
    expect(result).toEqual({ ok: true });
    expect(refreshHandler).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
  });
});

