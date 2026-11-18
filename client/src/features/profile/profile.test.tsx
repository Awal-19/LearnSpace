import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue, type AuthUser } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import * as avatarExport from './avatarExport';
import * as avatarUploadApi from './avatarUploadApi';
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

    const checkmark = screen.getByRole('img', { name: 'Verified account' });
    expect(checkmark).toHaveAttribute('title', 'Verified account');
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Unverified email')).not.toBeInTheDocument();
  });

  it('hides the verified checkmark when emailVerified is false', async () => {
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

    renderProfile({ ...baseUser, emailVerified: false });

    expect(await screen.findByText('Ama Mensah')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Verified account' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
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

  it('opens avatar studio modal, creates/saves custom avatar, edits existing avatar, and removes avatar back to initials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/users/me/stats')) {
        return new Response(
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
        );
      }
      if (url.endsWith('/users/me/avatar') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response('{}', { status: 404 });
    });

    const exportedFile = new File([new Uint8Array([137, 80, 78, 71])], 'custom-avatar.png', {
      type: 'image/png',
    });
    vi.spyOn(avatarExport, 'exportAvatarSvgFile').mockResolvedValue(exportedFile);
    const uploadSpy = vi.spyOn(avatarUploadApi, 'uploadAvatarFile').mockResolvedValue({
      avatarUrl: '/api/v1/users/u1/avatar?v=12345',
      avatarConfig: {
        faceShape: 'round',
        skinTone: '#ECC0A2',
        hairStyle: 'curly',
        hairColor: '#1E2028',
        eyes: 'glasses',
        eyebrows: 'natural',
        nose: 'classic',
        mouth: 'smile',
        clothing: 'blazer',
        clothingColor: '#2563EB',
        backgroundColor: '#EFF6FF',
      },
    });

    const updateUser = vi.fn();
    renderProfile(baseUser, updateUser);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Create avatar' }));

    expect(screen.getByRole('heading', { name: 'Update profile picture' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Round' }));
    await user.click(screen.getByRole('tab', { name: 'Hair' }));
    await user.click(screen.getByRole('button', { name: 'Curly' }));
    await user.click(screen.getByRole('tab', { name: 'Expression' }));
    await user.click(screen.getByRole('button', { name: 'Glasses' }));
    await user.click(screen.getByRole('tab', { name: 'Clothing' }));
    await user.click(screen.getByRole('button', { name: 'Blazer' }));

    await user.click(screen.getByRole('button', { name: 'Save Avatar' }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(
        exportedFile,
        expect.objectContaining({
          config: expect.objectContaining({
            faceShape: 'round',
            hairStyle: 'curly',
            eyes: 'glasses',
            clothing: 'blazer',
          }),
        }),
      );
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: '/api/v1/users/u1/avatar?v=12345',
          avatarConfig: expect.objectContaining({ hairStyle: 'curly' }),
        }),
      );
    });

    // Reject invalid non-image file in Upload a Photo tab
    await user.click(screen.getByRole('button', { name: 'Upload photo' }));
    const fileInput = screen.getByLabelText('Choose profile photo') as HTMLInputElement;
    const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a JPG, JPEG, PNG, or WEBP image.',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // When user already has a created avatar, Edit avatar and Remove controls appear
    const updateWithExisting = vi.fn();
    renderProfile(
      {
        ...baseUser,
        avatarUrl: '/api/v1/users/u1/avatar?v=12345',
        avatarConfig: {
          faceShape: 'round',
          skinTone: '#ECC0A2',
          hairStyle: 'curly',
          hairColor: '#1E2028',
          eyes: 'glasses',
          eyebrows: 'natural',
          nose: 'classic',
          mouth: 'smile',
          clothing: 'blazer',
          clothingColor: '#2563EB',
          backgroundColor: '#EFF6FF',
        },
      },
      updateWithExisting,
    );

    expect(screen.getByRole('button', { name: 'Edit avatar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/users/me/avatar',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(updateWithExisting).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: null, avatarConfig: null }),
      );
    });
  });

  it('opens device camera viewfinder from Take photo and stops tracks when switching back or closing', async () => {
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

    const stopTrack = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => fakeStream);

    const prevSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    const prevMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    try {
      renderProfile();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Take photo' }));

      expect(screen.getByRole('heading', { name: 'Update profile picture' })).toBeInTheDocument();
      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({ facingMode: { ideal: 'user' } }),
          }),
        );
      });

      expect(await screen.findByRole('button', { name: 'Capture photo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Switch camera' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(stopTrack).toHaveBeenCalled();
    } finally {
      if (prevSecure) Object.defineProperty(window, 'isSecureContext', prevSecure);
      if (prevMedia) Object.defineProperty(navigator, 'mediaDevices', prevMedia);
    }
  });
});
