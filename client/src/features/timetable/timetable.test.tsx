import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue, type AuthUser } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import type { CourseSummary } from '../courses/coursesApi';
import { DashboardPage } from '../dashboard/DashboardPage';
import { TimetablePage } from './TimetablePage';
import type { TimetableEntry } from './timetableApi';

const studentUser: AuthUser = {
  id: 'u1',
  email: 'kwame@uni.edu',
  name: 'Kwame Boateng',
  emailVerified: true,
  avatarUrl: null,
};

const authValue: AuthContextValue = {
  status: 'authenticated',
  user: studentUser,
  setSession: vi.fn(),
  updateUser: vi.fn(),
  clearSession: vi.fn(),
  logout: vi.fn(async () => undefined),
  markEmailVerified: vi.fn(),
};

function makeCourses(): CourseSummary[] {
  const now = new Date().toISOString();
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Data Structures & Algorithms',
      code: 'CSCD 204',
      lecturer: 'Dr. Mensah',
      creditHours: 3,
      semester: '2026 Semester 1',
      level: 'Level 200',
      color: '#2563EB',
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      noteCount: 0,
      documentCount: 0,
      taskCount: 0,
      deckCount: 0,
      quizCount: 0,
      studySeconds: 0,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Calculus II',
      code: 'MATH 223',
      lecturer: 'Prof. Owusu',
      creditHours: 3,
      semester: '2026 Semester 1',
      level: 'Level 200',
      color: '#10B981',
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      noteCount: 0,
      documentCount: 0,
      taskCount: 0,
      deckCount: 0,
      quizCount: 0,
      studySeconds: 0,
    },
  ];
}

function makeEntry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  const now = new Date().toISOString();
  return {
    id: 'aaaa1111-1111-4111-8111-111111111111',
    courseId: '11111111-1111-4111-8111-111111111111',
    dayOfWeek: 1,
    startMinute: 480, // 08:00
    endMinute: 600, // 10:00
    venue: 'NNB 1',
    type: 'lecture',
    reminderEnabled: true,
    reminderMinutes: null,
    createdAt: now,
    updatedAt: now,
    course: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Data Structures & Algorithms',
      code: 'CSCD 204',
      color: '#2563EB',
      lecturer: 'Dr. Mensah',
      archivedAt: null,
    },
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/app/timetable']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setAccessToken('test-token');
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('TimetablePage', () => {
  it('renders weekly grid & day view, detects clashes, adds/edits/deletes classes, and saves default reminder lead time', async () => {
    const courses = makeCourses();
    let entries: TimetableEntry[] = [makeEntry()];
    let defaultReminderMinutes = 15;
    const postBodies: unknown[] = [];
    const patchCalls: Array<{ url: string; body: unknown }> = [];
    const deleteIds: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/courses') && method === 'GET') {
        return new Response(JSON.stringify(courses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/timetable') && method === 'GET') {
        return new Response(
          JSON.stringify({ entries, timezone: 'Africa/Accra', defaultReminderMinutes }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/timetable') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        postBodies.push(body);
        const course = courses.find((c) => c.id === body.courseId)!;
        const created = makeEntry({
          id: 'bbbb2222-2222-4222-8222-222222222222',
          courseId: body.courseId,
          dayOfWeek: body.dayOfWeek,
          startMinute: body.startMinute,
          endMinute: body.endMinute,
          venue: body.venue ?? null,
          type: body.type,
          reminderEnabled: body.reminderEnabled ?? true,
          reminderMinutes: body.reminderMinutes ?? null,
          course: {
            id: course.id,
            name: course.name,
            code: course.code,
            color: course.color,
            lecturer: course.lecturer,
            archivedAt: null,
          },
        });
        entries = [...entries, created];
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/timetable/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        patchCalls.push({ url, body });
        const id = url.split('/timetable/')[1]!;
        entries = entries.map((e) => (e.id === id ? { ...e, ...body } : e));
        return new Response(JSON.stringify(entries.find((e) => e.id === id)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/timetable/') && method === 'DELETE') {
        const id = url.split('/timetable/')[1]!;
        deleteIds.push(id);
        entries = entries.filter((e) => e.id !== id);
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/users/me/settings') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        patchCalls.push({ url, body });
        if (typeof body.classReminderMinutes === 'number') {
          defaultReminderMinutes = body.classReminderMinutes;
        }
        return new Response(JSON.stringify({ classReminderMinutes: defaultReminderMinutes }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 404 });
    });

    renderWithProviders(
      <Routes>
        <Route path="/app/timetable" element={<TimetablePage />} />
      </Routes>,
    );

    const user = userEvent.setup();

    expect(await screen.findByText(/Africa\/Accra/)).toBeInTheDocument();
    expect(screen.getAllByText(/CSCD 204/).length).toBeGreaterThan(0);

    // Switch default reminder lead time via header dropdown
    await user.selectOptions(screen.getByLabelText('Default class reminder lead time'), '30');
    await waitFor(() => {
      expect(patchCalls.some((c) => c.url.endsWith('/users/me/settings'))).toBe(true);
    });

    // Weekend toggle reveals Sat & Sun columns/tabs
    await user.click(screen.getByLabelText('Include Sat & Sun'));
    expect(screen.getByRole('button', { name: 'Add class on Saturday' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add class on Sunday' })).toBeInTheDocument();

    // Open Add class modal on Monday -> defaults 09:00–10:00 overlaps Monday 08:00–10:00!
    await user.click(screen.getByRole('button', { name: 'Add class on Monday' }));
    expect(await screen.findByText(/Time clash detected on Monday/)).toBeInTheDocument();

    // Adjust start/end to non-overlapping 11:00–12:30 for Calculus II
    await user.selectOptions(
      screen.getByLabelText('Course'),
      '22222222-2222-4222-8222-222222222222',
    );
    const startInput = screen.getByLabelText('Start time');
    const endInput = screen.getByLabelText('End time');
    await user.clear(startInput);
    await user.type(startInput, '11:00');
    await user.clear(endInput);
    await user.type(endInput, '12:30');
    await user.selectOptions(screen.getByLabelText('Class type'), 'lab');
    await user.type(screen.getByLabelText('Venue (optional)'), 'Math Lab 1');
    const addDialog = screen.getByRole('dialog', { name: 'Add class to timetable' });
    await user.click(within(addDialog).getByRole('button', { name: 'Add class' }));

    await waitFor(() => {
      expect(postBodies).toHaveLength(1);
    });
    expect(postBodies[0]).toMatchObject({
      courseId: '22222222-2222-4222-8222-222222222222',
      dayOfWeek: 1,
      startMinute: 660,
      endMinute: 750,
      venue: 'Math Lab 1',
      type: 'lab',
    });

    // Switch to Day view and pick Monday
    await user.click(screen.getByRole('tab', { name: 'Day view' }));
    await user.click(screen.getByRole('tab', { name: /^Mon/ }));
    expect(await screen.findByText('Math Lab 1')).toBeInTheDocument();

    // Edit Calculus II venue -> Save changes
    await user.click(screen.getByRole('button', { name: 'Edit Calculus II on Monday' }));
    const editDialog = screen.getByRole('dialog', { name: 'Edit class' });
    const venueInput = within(editDialog).getByLabelText('Venue (optional)');
    await user.clear(venueInput);
    await user.type(venueInput, 'Sci Hall 7');
    await user.click(within(editDialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(
        patchCalls.some((c) => c.url.includes('/timetable/bbbb2222-2222-4222-8222-222222222222')),
      ).toBe(true);
    });
    expect(await screen.findByText('Sci Hall 7')).toBeInTheDocument();

    // Delete Calculus II class via confirmation modal
    await user.click(screen.getByRole('button', { name: 'Delete Calculus II on Monday' }));
    expect(await screen.findByText('Remove class from timetable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove class' }));

    await waitFor(() => {
      expect(deleteIds).toContain('bbbb2222-2222-4222-8222-222222222222');
    });
  });
});

describe('DashboardPage Timetable Card', () => {
  it('displays next class countdown and today schedule on Dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/dashboard')) {
        return new Response(
          JSON.stringify({
            greetingName: 'Kwame',
            timezone: 'Africa/Accra',
            todayTasks: [],
            overdueCount: 0,
            upcoming: [],
            todayClasses: [
              {
                id: 'c1',
                courseId: '11111111-1111-4111-8111-111111111111',
                courseName: 'Data Structures & Algorithms',
                courseCode: 'CSCD 204',
                courseColor: '#2563EB',
                lecturer: 'Dr. Mensah',
                dayOfWeek: 3,
                startMinute: 540,
                endMinute: 660,
                venue: 'NNB 1',
                type: 'lecture',
              },
            ],
            nextClass: {
              id: 'c1',
              courseId: '11111111-1111-4111-8111-111111111111',
              courseName: 'Data Structures & Algorithms',
              courseCode: 'CSCD 204',
              courseColor: '#2563EB',
              lecturer: 'Dr. Mensah',
              dayOfWeek: 3,
              startMinute: 540,
              endMinute: 660,
              venue: 'NNB 1',
              type: 'lecture',
              status: 'upcoming',
              startsInMinutes: 25,
              endsInMinutes: 145,
              dayOffset: 0,
              dayLabel: 'Today',
            },
            stats: { streakDays: 3, hoursLast7Days: 6.5 },
            recentConversations: [],
            unreadNotifications: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    renderWithProviders(
      <Routes>
        <Route path="/app" element={<DashboardPage />} />
      </Routes>,
      ['/app'],
    );

    expect(await screen.findByText(/Next class & today's schedule/i)).toBeInTheDocument();
    expect(screen.getByText('Starts in 25m')).toBeInTheDocument();
    expect(screen.getByText("Today's classes (1)")).toBeInTheDocument();
    expect(screen.getAllByText('NNB 1').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Open timetable/i })).toHaveAttribute(
      'href',
      '/timetable',
    );
  });
});
