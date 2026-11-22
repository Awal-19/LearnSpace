import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../design';
import { ApiError } from '../../lib/apiClient';
import * as adminApi from './adminApi';
import { AdminPageErrorBoundary } from './AdminPageErrorBoundary';
import { AdminShsPage } from './AdminShsPage';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminShsPage & AdminPageErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton while fetching', () => {
    vi.spyOn(adminApi, 'fetchAdminShsOverview').mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<AdminShsPage />);
    expect(screen.getByLabelText('Loading SHS & Safety')).toBeTruthy();
  });

  it('renders empty state messages when database has no flags or subjects', async () => {
    vi.spyOn(adminApi, 'fetchAdminShsOverview').mockResolvedValue({
      counts: {
        shsUsers: 0,
        universityUsers: 12,
        consentPending: 0,
        consentGiven: 0,
        consentWithdrawn: 0,
        openFlagsCount: 0,
      },
      settings: {
        featureShsSignups: false,
        featureShsCommunity: true,
        shsBannedWords: [],
        shsSyllabusSource: 'NaCCA / GES',
      },
      flags: [],
      subjects: [],
    });

    renderWithQuery(<AdminShsPage />);
    await waitFor(() => {
      expect(screen.getByText('SHS & Child Safety')).toBeTruthy();
    });
    expect(screen.getByText(/No pending SHS moderation flags/i)).toBeTruthy();
    expect(screen.getByText(/No SHS subjects in the catalogue yet/i)).toBeTruthy();
  });

  it('renders populated SHS counts, flags, and subjects', async () => {
    vi.spyOn(adminApi, 'fetchAdminShsOverview').mockResolvedValue({
      counts: {
        shsUsers: 4,
        universityUsers: 20,
        consentPending: 2,
        consentGiven: 2,
        consentWithdrawn: 0,
        openFlagsCount: 1,
      },
      settings: {
        featureShsSignups: true,
        featureShsCommunity: true,
        shsBannedWords: ['spam'],
        shsSyllabusSource: 'NaCCA / GES',
      },
      flags: [
        {
          id: 'f1',
          source: 'ai_chat',
          direction: 'input',
          reason: 'distress_signal',
          excerpt: 'test excerpt',
          createdAt: new Date().toISOString(),
          user: { id: 'u1', name: 'Kofi', schoolYear: 'SHS 2' },
        },
      ],
      subjects: [
        {
          id: 's1',
          name: 'Core Mathematics',
          code: 'CMATH',
          isCore: true,
          syllabusVersion: 'NaCCA-2024',
          active: true,
          topics: [{ id: 't1', title: 'Logarithms', schoolYear: 'SHS 1' }],
        },
      ],
    });

    renderWithQuery(<AdminShsPage />);
    await waitFor(() => {
      expect(screen.getByText('Core Mathematics (CMATH)')).toBeTruthy();
    });
    expect(screen.getByText('distress_signal')).toBeTruthy();
    expect(screen.getByText(/SHS Sign-ups: Open/i)).toBeTruthy();
  });

  it('renders role error message on 403 and Retry button on API failure', async () => {
    vi.spyOn(adminApi, 'fetchAdminShsOverview').mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'Forbidden'),
    );

    renderWithQuery(<AdminShsPage />);
    await waitFor(() => {
      expect(screen.getByText(/needs admin or super admin access/i)).toBeTruthy();
    });
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
  });

  it('catches render crashes in AdminPageErrorBoundary with Retry and Report problem', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Crash(): React.ReactElement {
      throw new Error('Boom');
    }

    renderWithQuery(
      <AdminPageErrorBoundary>
        <Crash />
      </AdminPageErrorBoundary>,
    );
    expect(screen.getByText(/This admin page ran into a problem/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Report problem/i })).toBeTruthy();
    spy.mockRestore();
  });
});
