import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import type { CourseSummary } from '../courses/coursesApi';
import { NotesPage } from './NotesPage';

function makeCourse(id: string, name: string): CourseSummary {
  const now = new Date().toISOString();
  return {
    id,
    name,
    code: null,
    lecturer: null,
    creditHours: null,
    semester: null,
    level: null,
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
  };
}

function renderNotesPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    status: 'authenticated',
    user: {
      id: 'u1',
      email: 'student@uni.edu',
      name: 'Student',
      emailVerified: true,
      avatarUrl: null,
    },
    setSession: vi.fn(),
    clearSession: vi.fn(),
    markEmailVerified: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(),
  };

  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <MemoryRouter>
            <NotesPage />
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('NotesPage Add course flow', () => {
  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('creates courses via button click and Enter, prevents empty/duplicate submits, and rolls back on server error', async () => {
    setAccessToken('tok');
    const courses: CourseSummary[] = [makeCourse('c1', 'Calculus I')];
    let failNextPost = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.endsWith('/courses') && method === 'GET') {
        return new Response(JSON.stringify(courses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/courses') && method === 'POST') {
        if (failNextPost) {
          return new Response(
            JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Database down' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as { name: string };
        const created = makeCourse(`c-${courses.length + 1}`, body.name);
        courses.push(created);
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/notes') && method === 'GET') {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    renderNotesPage();
    const user = userEvent.setup();

    const input = await screen.findByLabelText('New course name');
    const addBtn = screen.getByRole('button', { name: 'Add course' });

    // Disabled when empty
    expect(addBtn).toBeDisabled();

    // Create via Enter key
    await user.type(input, 'Organic Chemistry{enter}');
    expect(await screen.findByRole('button', { name: /Organic Chemistry/ })).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue(''));
    expect(document.activeElement).toBe(input);

    // Duplicate (case-insensitive) shows inline error
    await user.type(input, 'organic chemistry{enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    await user.clear(input);

    // Server 500 rolls back optimistic course and shows friendly inline error
    failNextPost = true;
    await user.type(input, 'Thermodynamics');
    expect(addBtn).toBeEnabled();
    await user.click(addBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't add course, please try again.",
    );
    expect(screen.queryByRole('button', { name: /Thermodynamics/ })).not.toBeInTheDocument();
  });
});
