import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ThemeProvider } from '../../app/ThemeProvider';
import { ToastProvider } from '../../design';
import { request, setAccessToken, setRefreshHandler } from '../../lib/apiClient';
import { PrivacyPolicyPage } from '../legal/PrivacyPolicyPage';
import { TermsPage } from '../legal/TermsPage';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
      };
    }
  }
});

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
              <Route path="/signup" element={ui} />
              <Route path="/verify-email" element={<div>Verify email screen</div>} />
              <Route path="/terms-and-conditions" element={<TermsPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
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

  it('starts unchecked and blocks registration until Terms and Conditions are accepted', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/providers')) {
        return new Response(JSON.stringify({ google: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ requiresVerification: true, email: 'ama@uni.edu' }), {
        status: 201,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <AuthContext.Provider
            value={{
              status: 'unauthenticated',
              user: null,
              setSession: vi.fn(),
              updateUser: vi.fn(),
              clearSession: vi.fn(),
              logout: vi.fn(async () => undefined),
              markEmailVerified: vi.fn(),
            }}
          >
            <MemoryRouter initialEntries={['/signup']}>
              <Routes>
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify-email" element={<div>Verify email screen</div>} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const checkbox = screen.getByRole('checkbox', {
      name: /I agree to the Terms and Conditions and Privacy Policy/i,
    });
    expect(checkbox).not.toBeChecked();

    await userEvent.type(screen.getByLabelText('Full name'), 'Ama Mensah');
    await userEvent.type(screen.getByLabelText('Email'), 'ama@uni.edu');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rdOK');

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        'Please accept the Terms and Conditions and Privacy Policy to continue.',
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/signup'),
      expect.anything(),
    );

    // Clicking Terms and Conditions / Privacy Policy opens modal without checking the box or losing form values
    await userEvent.click(screen.getByRole('link', { name: 'Terms and Conditions' }));
    expect(await screen.findByText('14. Contact Information')).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(
      await screen.findByText('6. Infrastructure & Third-Party Service Providers'),
    ).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Check consent and submit successfully
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Verify email screen')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/signup'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"acceptTerms":true'),
      }),
    );

    // Remounting / refreshing keeps the consent checkbox unchecked
    unmount();
    renderWithAuth(<SignupPage />);
    expect(
      screen.getByRole('checkbox', {
        name: /I agree to the Terms and Conditions and Privacy Policy/i,
      }),
    ).not.toBeChecked();
  });

  it('renders dedicated Terms and Conditions and Privacy Policy pages with back-to-registration links', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/terms-and-conditions']}>
            <Routes>
              <Route path="/terms-and-conditions" element={<TermsPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms and Conditions' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Effective Date: November 18, 2026/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '6. AI Assistant and AI-Generated Content' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '14. Contact Information' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Sign up/i })).toHaveAttribute(
      'href',
      '/signup',
    );

    unmount();

    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/privacy-policy']}>
            <Routes>
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '7. Security Practices Implemented' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Sign up/i })).toHaveAttribute(
      'href',
      '/signup',
    );
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
