import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue, type AuthUser } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { ProfilePage } from './ProfilePage';

const baseUser: AuthUser = {
  id: 'u1',
  email: 'ama@uni.edu',
  name: 'Ama Mensah',
  emailVerified: true,
  studentId: '109283',
  programme: 'Computer Science',
  level: 'Level 300',
  university: 'University of Ghana',
  bio: 'Studying distributed systems',
  avatarUrl: null,
  hasPassword: true,
};

function renderProfile(user: AuthUser = baseUser, updateUser = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    status: 'authenticated',
    user,
    setSession: vi.fn(),
    updateUser,
    clearSession: vi.fn(),
    logout: vi.fn(async () => undefined),
    markEmailVerified: vi.fn(),
  };
  setAccessToken('test-token');

  return {
    updateUser,
    ...render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <ProfilePage />
          </AuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('ProfilePage', () => {
  it('T-PROF-07: renders real stats from GET /users/me/stats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          streakDays: 5,
          longestStreakDays: 12,
          hoursStudied: 38.5,
          hoursLast7Days: 6.25,
          notesCreated: 14,
          quizzesTaken: 9,
          averageQuizScore: 0.78,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderProfile();

    expect(await screen.findByText('5 days')).toBeInTheDocument();
    expect(screen.getByText('38.5h')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Average score: 78%')).toBeInTheDocument();
  });

  it('validates bio max length and submits PATCH /users/me on save', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            streakDays: 0,
            longestStreakDays: 0,
            hoursStudied: 0,
            hoursLast7Days: 0,
            notesCreated: 0,
            quizzesTaken: 0,
            averageQuizScore: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...baseUser, name: 'Ama K. Mensah' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const { updateUser } = renderProfile();
    const user = userEvent.setup();

    const bioInput = screen.getByLabelText('Bio');
    fireEvent.change(bioInput, { target: { value: 'a'.repeat(501) } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Bio must be 500 characters or fewer')).toBeInTheDocument();

    fireEvent.change(bioInput, { target: { value: 'Studying distributed systems' } });
    const nameInput = screen.getByLabelText('Full name');
    fireEvent.change(nameInput, { target: { value: 'Ama K. Mensah' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ama K. Mensah' }));
    });
  });

  it('switches to Security tab and shows password and danger zone controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          streakDays: 0,
          longestStreakDays: 0,
          hoursStudied: 0,
          hoursLast7Days: 0,
          notesCreated: 0,
          quizzesTaken: 0,
          averageQuizScore: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderProfile();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Security' }));

    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out everywhere' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });
});

