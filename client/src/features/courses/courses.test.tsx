import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { CourseDetailPage } from './CourseDetailPage';
import { CoursesPage } from './CoursesPage';
import type { CourseDetailResponse, CourseSummary } from './coursesApi';

function makeCourse(overrides: Partial<CourseSummary> = {}): CourseSummary {
  const now = new Date().toISOString();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Data Structures & Algorithms',
    code: 'CSCD 204',
    lecturer: 'Dr. Mensah',
    creditHours: 3,
    semester: '2026 Semester 1',
    level: 'Level 200',
    color: '#2563EB',
    notes: 'Core CS module.',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    noteCount: 2,
    documentCount: 1,
    taskCount: 3,
    deckCount: 1,
    quizCount: 1,
    studySeconds: 5400,
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement, initialEntries = ['/app/courses']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setAccessToken('test-token');
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('CoursesPage', () => {
  it('filters active/archived tabs, searches, filters by semester, and creates/edits courses', async () => {
    const activeCourse1 = makeCourse();
    const activeCourse2 = makeCourse({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Linear Algebra',
      code: 'MATH 223',
      lecturer: 'Prof. Boateng',
      semester: '2026 Semester 2',
      color: '#10B981',
    });
    const archivedCourse = makeCourse({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Introductory Logic',
      code: 'PHIL 101',
      lecturer: 'Dr. Osei',
      semester: '2025 Semester 1',
      archivedAt: new Date().toISOString(),
    });

    let store: CourseSummary[] = [activeCourse1, activeCourse2, archivedCourse];
    const postBodies: unknown[] = [];
    const patchCalls: Array<{ url: string; body: unknown }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/courses') && method === 'GET') {
        return new Response(JSON.stringify(store), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/courses') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        postBodies.push(body);
        const created = makeCourse({
          id: '44444444-4444-4444-8444-444444444444',
          name: body.name,
          code: body.code ?? null,
          lecturer: body.lecturer ?? null,
          creditHours: body.creditHours ?? null,
          semester: body.semester ?? null,
          level: body.level ?? null,
          color: body.color ?? '#2563EB',
          notes: body.notes ?? null,
          noteCount: 0,
          documentCount: 0,
          taskCount: 0,
          deckCount: 0,
          quizCount: 0,
          studySeconds: 0,
        });
        store = [created, ...store];
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/courses/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        patchCalls.push({ url, body });
        const id = url.split('/courses/')[1]!;
        store = store.map((c) => (c.id === id ? { ...c, ...body } : c));
        const updated = store.find((c) => c.id === id)!;
        return new Response(JSON.stringify(updated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 404 });
    });

    renderWithQuery(
      <Routes>
        <Route path="/app/courses" element={<CoursesPage />} />
      </Routes>,
    );

    const user = userEvent.setup();

    expect(await screen.findByText('Data Structures & Algorithms')).toBeInTheDocument();
    expect(screen.getByText('Linear Algebra')).toBeInTheDocument();
    expect(screen.queryByText('Introductory Logic')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Archived (1)' })).toBeInTheDocument();

    // Search filters visible cards
    await user.type(screen.getByLabelText('Search courses'), 'Linear');
    expect(screen.queryByText('Data Structures & Algorithms')).not.toBeInTheDocument();
    expect(screen.getByText('Linear Algebra')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search courses'));
    expect(screen.getByText('Data Structures & Algorithms')).toBeInTheDocument();

    // Semester filter narrows cards
    await user.selectOptions(screen.getByLabelText('Filter by semester'), '2026 Semester 1');
    expect(screen.getByText('Data Structures & Algorithms')).toBeInTheDocument();
    expect(screen.queryByText('Linear Algebra')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by semester'), '');

    // Switch to Archived tab
    await user.click(screen.getByRole('tab', { name: 'Archived (1)' }));
    expect(screen.getByText('Introductory Logic')).toBeInTheDocument();
    expect(screen.queryByText('Data Structures & Algorithms')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Active (2)' }));

    // Create a course via CourseFormModal
    await user.click(screen.getByRole('button', { name: 'Add course' }));
    await user.type(screen.getByLabelText('Course name'), 'Operating Systems');
    await user.type(screen.getByLabelText('Course code'), 'CSCD 301');
    await user.type(screen.getByLabelText('Credit hours'), '3');
    await user.click(screen.getByRole('button', { name: 'Select Emerald' }));
    await user.click(screen.getByRole('button', { name: 'Create course' }));

    await waitFor(() => {
      expect(postBodies).toHaveLength(1);
    });
    expect(postBodies[0]).toMatchObject({
      name: 'Operating Systems',
      code: 'CSCD 301',
      creditHours: 3,
      color: '#10B981',
    });
    expect(await screen.findByText('Operating Systems')).toBeInTheDocument();

    // Edit an existing course via CourseFormModal
    await user.click(screen.getByRole('button', { name: 'Edit Data Structures & Algorithms' }));
    const nameInput = screen.getByLabelText('Course name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Algorithms & Complexity');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(patchCalls).toHaveLength(1);
    });
    expect(patchCalls[0]?.body).toMatchObject({ name: 'Algorithms & Complexity' });
  });

  it('opens DeleteCourseModal and sends both unassign and delete query modes', async () => {
    const courseA = makeCourse({
      id: 'aaaa1111-1111-4111-8111-111111111111',
      name: 'Course Keep Items',
    });
    const courseB = makeCourse({
      id: 'bbbb2222-2222-4222-8222-222222222222',
      name: 'Course Purge Items',
    });
    let store: CourseSummary[] = [courseA, courseB];
    const deleteUrls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/courses') && method === 'GET') {
        return new Response(JSON.stringify(store), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/courses/') && method === 'DELETE') {
        deleteUrls.push(url);
        const pathPart = url.split('/courses/')[1] ?? '';
        const id = pathPart.split('?')[0];
        store = store.filter((c) => c.id !== id);
        return new Response(null, { status: 204 });
      }

      return new Response('{}', { status: 404 });
    });

    renderWithQuery(
      <Routes>
        <Route path="/app/courses" element={<CoursesPage />} />
      </Routes>,
    );

    const user = userEvent.setup();

    expect(await screen.findByText('Course Keep Items')).toBeInTheDocument();

    // First delete with default 'unassign' mode
    await user.click(screen.getByRole('button', { name: 'Delete Course Keep Items' }));
    expect(screen.getByLabelText(/Keep items unassigned/)).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Delete course' }));

    await waitFor(() => {
      expect(deleteUrls).toHaveLength(1);
    });
    expect(deleteUrls[0]).toContain('/courses/aaaa1111-1111-4111-8111-111111111111?mode=unassign');

    // Second delete switching to 'delete' mode
    await user.click(screen.getByRole('button', { name: 'Delete Course Purge Items' }));
    await user.click(screen.getByLabelText(/Delete course and all linked items/));
    await user.click(screen.getByRole('button', { name: 'Delete course' }));

    await waitFor(() => {
      expect(deleteUrls).toHaveLength(2);
    });
    expect(deleteUrls[1]).toContain('/courses/bbbb2222-2222-4222-8222-222222222222?mode=delete');
  });
});

describe('CourseDetailPage', () => {
  it('renders course stats and all six linked overview tabs', async () => {
    const courseId = 'cccccccc-1111-4111-8111-111111111111';
    const detail: CourseDetailResponse = {
      course: makeCourse({ id: courseId, name: 'Database Systems', code: 'CSCD 312' }),
      notes: [
        {
          id: 'n1',
          title: 'Normalization Forms',
          aiSummary: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      documents: [
        {
          id: 'd1',
          title: 'ER Diagrams Deck',
          type: 'slides',
          originalName: 'er-slides.pdf',
          status: 'ready',
          pageCount: 24,
          createdAt: new Date().toISOString(),
        },
      ],
      tasks: [
        {
          id: 't1',
          title: 'Build schema ERD',
          dueAt: new Date().toISOString(),
          priority: 'high',
          status: 'todo',
          completedAt: null,
        },
        {
          id: 't2',
          title: 'Read Chapter 2',
          dueAt: null,
          priority: 'low',
          status: 'done',
          completedAt: new Date().toISOString(),
        },
      ],
      decks: [
        {
          id: 'dk1',
          title: 'SQL Joins Flashcards',
          topic: 'Joins',
          cardCount: 12,
          updatedAt: new Date().toISOString(),
        },
      ],
      quizzes: [
        {
          id: 'q1',
          title: 'Transactions Quiz',
          topic: 'ACID',
          questionCount: 5,
          attempts: 1,
          bestScore: 0.85,
          lastScore: 0.85,
          createdAt: new Date().toISOString(),
        },
      ],
      upcomingExams: [],
      stats: {
        studySeconds: 5400,
        averageQuizScore: 0.85,
        quizzesTaken: 1,
        openTasksCount: 1,
        completedTasksCount: 1,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith(`/courses/${courseId}`)) {
        return new Response(JSON.stringify(detail), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    renderWithQuery(
      <Routes>
        <Route path="/app/courses/:courseId" element={<CourseDetailPage />} />
      </Routes>,
      [`/app/courses/${courseId}`],
    );

    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Database Systems' })).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('1/2 done')).toBeInTheDocument();

    // Default tab: Notes
    expect(screen.getByText('Normalization Forms')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Documents (1)' }));
    expect(screen.getByText('ER Diagrams Deck')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tasks (2)' }));
    expect(screen.getByText('Build schema ERD')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Flashcards (1)' }));
    expect(screen.getByText('SQL Joins Flashcards')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Quizzes (1)' }));
    expect(screen.getByText('Transactions Quiz')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Exams (0)' }));
    expect(screen.getByText('No upcoming exams for this course')).toBeInTheDocument();
  });
});
