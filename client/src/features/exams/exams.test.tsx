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
import { ExamsPage } from './ExamsPage';
import type { ExamItem, RevisionPlanItem } from './examsApi';

const studentUser: AuthUser = {
  id: 'u1',
  email: 'ama@uni.edu',
  name: 'Ama Mensah',
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
      name: 'Database Systems',
      code: 'CSCD 312',
      lecturer: 'Dr. Boateng',
      creditHours: 3,
      semester: '2026 Semester 1',
      level: 'Level 300',
      color: '#2563EB',
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      noteCount: 1,
      documentCount: 1,
      taskCount: 0,
      deckCount: 0,
      quizCount: 0,
      studySeconds: 0,
    },
  ];
}

function makeExam(overrides: Partial<ExamItem> = {}): ExamItem {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 4 * 24 * 3600_000).toISOString();
  return {
    id: 'eeee1111-1111-4111-8111-111111111111',
    courseId: '11111111-1111-4111-8111-111111111111',
    title: 'Midterm Examination',
    examType: 'midterm',
    startsAt: future,
    durationMinutes: 120,
    venue: 'NNB 3',
    weightPercent: 30,
    topics: ['Normalization', 'Transactions'],
    notes: 'Bring calculator',
    createdAt: now,
    updatedAt: now,
    course: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Database Systems',
      code: 'CSCD 312',
      color: '#2563EB',
      archivedAt: null,
    },
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/app/exams']) {
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

describe('ExamsPage & AI Revision Plan workflow', () => {
  it('lists exam countdowns, creates/edits/deletes exams, and generates/edits/saves/reschedules an AI revision plan', async () => {
    const courses = makeCourses();
    let exams: ExamItem[] = [makeExam()];
    let plans: RevisionPlanItem[] = [];
    const postExamBodies: unknown[] = [];
    const savePlanBodies: unknown[] = [];
    let rescheduleCalled = false;

    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/courses') && method === 'GET') {
        return new Response(JSON.stringify(courses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/exams') && method === 'GET') {
        return new Response(
          JSON.stringify({
            items: exams,
            timezone: 'Africa/Accra',
            defaultExamReminderMinutes: 1440,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/exams') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        postExamBodies.push(body);
        const created = makeExam({
          id: 'eeee2222-2222-4222-8222-222222222222',
          title: body.title,
          examType: body.examType,
          venue: body.venue ?? null,
          weightPercent: body.weightPercent ?? null,
          topics: body.topics ?? [],
          startsAt: body.startsAt,
        });
        exams = [...exams, created];
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/exams/') && method === 'DELETE') {
        const id = url.split('/exams/')[1]!;
        exams = exams.filter((e) => e.id !== id);
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/revision-plans') && method === 'GET') {
        return new Response(JSON.stringify(plans), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/revision-plans/generate') && method === 'POST') {
        return new Response(
          JSON.stringify({
            draft: {
              title: 'CSCD 312 Finals Prep',
              startDate: todayStr,
              endDate: tomorrowStr,
              hoursPerDay: 2,
              daysOff: [0],
              preferredTimes: ['evening'],
              sessions: [
                {
                  scheduledDate: todayStr,
                  startTime: '18:30',
                  durationMinutes: 60,
                  courseId: courses[0]!.id,
                  examId: exams[0]!.id,
                  topic: 'Serializability Conflicts',
                  notes: 'Practice 2PL schedules',
                },
              ],
            },
            contextSummary: {
              examCount: 1,
              noteCount: 1,
              documentCount: 1,
              weakTopics: ['Serializability Conflicts'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/revision-plans') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        savePlanBodies.push(body);
        const saved: RevisionPlanItem = {
          id: 'pppp1111-1111-4111-8111-111111111111',
          title: body.title,
          startDate: body.startDate,
          endDate: body.endDate,
          hoursPerDay: body.hoursPerDay,
          daysOff: body.daysOff,
          preferredTimes: body.preferredTimes,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sessions: body.sessions.map((s: Record<string, unknown>, idx: number) => ({
            id: `ssss${idx}111-1111-4111-8111-111111111111`,
            planId: 'pppp1111-1111-4111-8111-111111111111',
            examId: (s.examId as string | null) ?? null,
            courseId: (s.courseId as string | null) ?? null,
            taskId: `tttt${idx}111-1111-4111-8111-111111111111`,
            scheduledDate: s.scheduledDate as string,
            startTime: s.startTime as string,
            durationMinutes: s.durationMinutes as number,
            topic: s.topic as string,
            notes: (s.notes as string | null) ?? null,
            status: 'planned',
            position: idx,
            course: {
              id: courses[0]!.id,
              name: courses[0]!.name,
              code: courses[0]!.code,
              color: courses[0]!.color,
            },
            exam: null,
            taskStatus: 'todo',
          })),
        };
        plans = [saved];
        return new Response(JSON.stringify(saved), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/reschedule-missed') && method === 'POST') {
        rescheduleCalled = true;
        return new Response(JSON.stringify({ plan: plans[0], rescheduledCount: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 404 });
    });

    renderWithProviders(
      <Routes>
        <Route path="/app/exams" element={<ExamsPage />} />
      </Routes>,
    );

    const user = userEvent.setup();

    expect(await screen.findByText('Midterm Examination')).toBeInTheDocument();
    expect(screen.getByText('NNB 3')).toBeInTheDocument();
    expect(screen.getByText('Normalization')).toBeInTheDocument();

    // Add a second exam via ExamFormModal
    await user.click(screen.getByRole('button', { name: 'Add exam' }));
    const addModal = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(addModal).getByLabelText('Exam title'), 'Final Assessment');
    await user.type(within(addModal).getByLabelText('Date & time'), '2026-12-15T09:00');
    await user.type(within(addModal).getByLabelText('Weight (% of grade, optional)'), '70');
    await user.type(
      within(addModal).getByLabelText('Topics to cover (comma or line separated)'),
      'B+ Trees, Concurrency',
    );
    await user.click(within(addModal).getByRole('button', { name: 'Add exam' }));

    await waitFor(() => {
      expect(postExamBodies).toHaveLength(1);
    });
    expect(postExamBodies[0]).toMatchObject({
      title: 'Final Assessment',
      weightPercent: 70,
      topics: ['B+ Trees', 'Concurrency'],
    });
    expect(await screen.findByText('Final Assessment')).toBeInTheDocument();

    // Delete the newly created exam with confirmation modal
    await user.click(screen.getByRole('button', { name: 'Delete Final Assessment' }));
    const delModal = screen.getByRole('dialog', { name: 'Delete exam' });
    await user.click(within(delModal).getByRole('button', { name: 'Delete exam' }));
    await waitFor(() => {
      expect(screen.queryByText('Final Assessment')).not.toBeInTheDocument();
    });

    // Switch to AI Revision Plan tab, generate draft, edit topic before saving, save to Planner, and reschedule missed
    await user.click(screen.getByRole('tab', { name: 'AI Revision Plan' }));
    await user.click(screen.getByRole('button', { name: 'Generate revision plan' }));

    expect(
      await screen.findByText(/Draft preview — review & edit before saving/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Serializability Conflicts', { selector: 'strong' }),
    ).toBeInTheDocument();

    const topicInput = screen.getByLabelText('Topic');
    await user.clear(topicInput);
    await user.type(topicInput, 'Serializability & Recovery');

    await user.click(screen.getByRole('button', { name: /Save plan & add to Planner/i }));
    await waitFor(() => {
      expect(savePlanBodies).toHaveLength(1);
    });
    expect((savePlanBodies[0] as { sessions: Array<{ topic: string }> }).sessions[0]?.topic).toBe(
      'Serializability & Recovery',
    );
    expect(await screen.findByText('CSCD 312 Finals Prep')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reschedule missed' }));
    await waitFor(() => {
      expect(rescheduleCalled).toBe(true);
    });
  }, 15_000);
});

describe('DashboardPage Exam Countdown Card', () => {
  it('renders upcoming exam countdown cards on Dashboard', async () => {
    const startsAt = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/dashboard')) {
        return new Response(
          JSON.stringify({
            greetingName: 'Ama',
            timezone: 'Africa/Accra',
            todayTasks: [],
            overdueCount: 0,
            upcoming: [],
            todayClasses: [],
            nextClass: null,
            upcomingExams: [
              {
                id: 'ex1',
                courseId: '11111111-1111-4111-8111-111111111111',
                courseName: 'Database Systems',
                courseCode: 'CSCD 312',
                courseColor: '#2563EB',
                title: 'Midterm Examination',
                examType: 'midterm',
                startsAt,
                durationMinutes: 120,
                venue: 'NNB 3',
                weightPercent: 30,
                topics: ['Normalization'],
              },
            ],
            stats: { streakDays: 2, hoursLast7Days: 4 },
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

    expect(await screen.findByText('Upcoming exam countdowns')).toBeInTheDocument();
    expect(screen.getAllByText('Midterm Examination').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Midterm · 30%/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open exams & revision/i })).toHaveAttribute(
      'href',
      '/exams',
    );
  });
});
