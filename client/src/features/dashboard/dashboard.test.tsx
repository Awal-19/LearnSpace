import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ThemeProvider } from '../../app/ThemeProvider';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { SettingsPage } from '../settings/SettingsPage';
import { DashboardPage } from './DashboardPage';
import type { ProgressAnalyticsResponse } from './analyticsApi';

function makeAuth(): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'user-1',
      email: 'kwame@learnspace.edu',
      name: 'Kwame Mensah',
      emailVerified: true,
      avatarUrl: null,
    },
    setSession: () => undefined,
    updateUser: () => undefined,
    clearSession: () => undefined,
    logout: async () => undefined,
    markEmailVerified: () => undefined,
  };
}

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setAccessToken('test-token');
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AuthContext.Provider value={makeAuth()}>
            <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
          </AuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
let fetchSpy: { mockRestore: () => void } | null = null;

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectUrl,
  });
  setAccessToken(null);
});

describe('Dashboard Redesign & Progress Analytics UI', () => {
  it('renders Daily Summary, switches analytics date ranges, toggles Best Hours, and launches "Revise this" from weak topics', async () => {
    const user = userEvent.setup();
    const rangesFetched: string[] = [];
    let generatedTopic: string | null = null;

    const sevenDayAnalytics: ProgressAnalyticsResponse = {
      range: '7d',
      timezone: 'Africa/Accra',
      windowStart: '2026-11-12',
      windowEnd: '2026-11-18',
      summary: {
        totalStudyHours: 3.5,
        studySessionCount: 4,
        averageQuizAccuracy: 65,
        flashcardReviews: 12,
        flashcardAccuracy: 75,
        tasksCompleted: 5,
        streakDays: 3,
        longestStreakDays: 6,
        bestStudyHour: { hour: 19, label: '19:00', minutes: 120 },
      },
      studyTimeByCourse: [
        { courseId: 'c1', label: 'CSCD 302 · OS', color: '#2563EB', minutes: 150, hours: 2.5 },
      ],
      quizScoreTrend: [
        { date: '2026-11-17', title: 'Scheduling Quiz', accuracyPct: 65, score: 13, total: 20 },
      ],
      flashcardActivityTrend: [{ date: '2026-11-18', reviews: 12, accuracyPct: 75 }],
      tasksCompletedTrend: [{ date: '2026-11-18', completed: 5 }],
      bestStudyHours: [{ hour: 19, label: '19:00', minutes: 120 }],
      weakTopics: [
        {
          topic: 'Deadlock Avoidance',
          source: 'flashcards',
          accuracyPct: 40,
          sampleCount: 5,
          courseId: 'c1',
        },
      ],
    };

    const thirtyDayAnalytics: ProgressAnalyticsResponse = {
      ...sevenDayAnalytics,
      range: '30d',
      summary: {
        ...sevenDayAnalytics.summary,
        totalStudyHours: 14.2,
      },
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes('/dashboard')) {
        return Response.json({
          greetingName: 'Kwame',
          timezone: 'Africa/Accra',
          todayTasks: [
            { id: 't1', title: 'Review Notes', dueAt: null, priority: 'high', status: 'todo' },
          ],
          overdueCount: 0,
          upcoming: [],
          todayClasses: [],
          nextClass: {
            id: 'slot-1',
            courseId: 'c1',
            courseName: 'Operating Systems',
            courseCode: 'CSCD 302',
            courseColor: '#2563EB',
            lecturer: 'Dr. Mensah',
            dayOfWeek: 3,
            startMinute: 600,
            endMinute: 720,
            venue: 'NNB 3',
            type: 'lecture',
            status: 'upcoming',
            startsInMinutes: 30,
            endsInMinutes: 150,
            dayOffset: 0,
            dayLabel: 'Today',
          },
          upcomingExams: [
            {
              id: 'ex-1',
              courseId: 'c1',
              courseName: 'Operating Systems',
              courseCode: 'CSCD 302',
              courseColor: '#2563EB',
              title: 'OS Midterm',
              examType: 'midterm',
              startsAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
              durationMinutes: 90,
              venue: 'Hall A',
              weightPercent: 30,
              topics: ['Deadlocks'],
            },
          ],
          nextExam: {
            id: 'ex-1',
            courseId: 'c1',
            courseName: 'Operating Systems',
            courseCode: 'CSCD 302',
            courseColor: '#2563EB',
            title: 'OS Midterm',
            examType: 'midterm',
            startsAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
            durationMinutes: 90,
            venue: 'Hall A',
            weightPercent: 30,
            topics: ['Deadlocks'],
          },
          dueFlashcardsCount: 9,
          todayStudyHours: 1.5,
          todayTasksDoneCount: 3,
          stats: { streakDays: 3, hoursLast7Days: 6 },
          recentConversations: [],
          unreadNotifications: 0,
        });
      }

      if (url.includes('/analytics?range=')) {
        const range = url.split('range=')[1]!;
        rangesFetched.push(range);
        return Response.json(range === '30d' ? thirtyDayAnalytics : sevenDayAnalytics);
      }

      if (url.endsWith('/decks/generate') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { topic?: string };
        generatedTopic = body.topic ?? null;
        return Response.json({ id: 'revise-deck-1', cards: [] }, { status: 201 });
      }

      return Response.json({});
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/study" element={<p>Navigated to Study Deck</p>} />
      </Routes>,
      ['/'],
    );

    // Daily summary items
    expect(await screen.findByText('1.5h today')).toBeInTheDocument();
    expect(screen.getByText('3 done')).toBeInTheDocument();
    expect(screen.getByText('9 due')).toBeInTheDocument();
    expect(screen.getAllByText('OS Midterm').length).toBeGreaterThanOrEqual(1);

    // Analytics switch to 30 days
    expect(await screen.findByText('19:00 (120m)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => {
      expect(rangesFetched).toContain('30d');
      expect(screen.getByText('14.2h')).toBeInTheDocument();
    });

    // Switch to Best hours tab inside Tasks/Hours chart card
    await user.click(screen.getByRole('button', { name: 'Best hours' }));
    expect(screen.getByRole('heading', { name: 'Best study hours' })).toBeInTheDocument();

    // Weak topic Revise this -> Flashcards
    expect(screen.getByText('Deadlock Avoidance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Revise this · Flashcards/i }));
    await waitFor(() => {
      expect(generatedTopic).toBe('Deadlock Avoidance');
      expect(screen.getByText('Navigated to Study Deck')).toBeInTheDocument();
    });
  });

  it('triggers JSON data export from SettingsPage', async () => {
    const user = userEvent.setup();
    let exportCalled = false;
    const createObjectUrlSpy = vi.fn(() => 'blob:mock-export');
    const revokeUrlSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeUrlSpy,
    });

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/users/me/settings')) {
        return Response.json({
          theme: 'system',
          timezone: 'UTC',
          notifyInApp: true,
          notifyEmailReminders: false,
          notifyProductEmail: false,
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          classReminderMinutes: 15,
          examReminderMinutes: 1440,
        });
      }
      if (url.endsWith('/users/me/export')) {
        exportCalled = true;
        return new Response(JSON.stringify({ exportedAt: '2026-11-18', version: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return Response.json({});
    });

    renderWithProviders(<SettingsPage />, ['/settings']);
    const exportBtn = await screen.findByRole('button', { name: /Export my data/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(exportCalled).toBe(true);
      expect(createObjectUrlSpy).toHaveBeenCalled();
    });
  });
});
