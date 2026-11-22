import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { CourseDetailPage } from '../courses/CourseDetailPage';
import { TopicLessonPage } from './TopicLessonPage';

const shsAuth: AuthContextValue = {
  status: 'authenticated',
  user: {
    id: 'u-shs',
    email: 'kwame@shs.edu.gh',
    name: 'Kwame Boateng',
    role: 'student',
    emailVerified: true,
    avatarUrl: null,
    learnerType: 'shs',
    schoolYear: 'SHS 1',
    programme: 'General Arts',
    ageGroup: 'under_18',
    guardianConsentStatus: 'given',
  },
  setSession: () => undefined,
  updateUser: () => undefined,
  clearSession: () => undefined,
  logout: async () => undefined,
  markEmailVerified: () => undefined,
};

function renderRoute(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={shsAuth}>
          <ToastProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<CourseDetailPage />} />
              <Route path="/subjects/:subjectId/topics/:topicId" element={<TopicLessonPage />} />
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('SHS Topic List & TopicLessonPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders interactive wrapping topic cards without wrong AWAL helper text', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/courses/subj-eng')) {
        return new Response(
          JSON.stringify({
            course: {
              id: 'subj-eng',
              name: 'English Language',
              code: null,
              lecturer: null,
              creditHours: null,
              semester: 'Term 1',
              level: 'SHS 1',
              color: '#2563EB',
              notes: null,
              archivedAt: null,
            },
            notes: [],
            documents: [],
            tasks: [],
            decks: [],
            quizzes: [],
            upcomingExams: [],
            stats: {
              studySeconds: 0,
              averageQuizScore: null,
              completedTasksCount: 0,
              openTasksCount: 0,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/shs/subjects/subj-eng/topics')) {
        return new Response(
          JSON.stringify({
            subjectId: 'cat-eng',
            topics: [
              {
                id: 't-comp',
                title: 'Reading Comprehension & Summary Writing',
                strand: 'Reading',
                subStrand: null,
                schoolYear: 'SHS 1',
                lessonReady: true,
                lessonStatus: 'approved',
                estimatedMinutes: 8,
                progressStatus: 'completed',
                positionPct: 100,
              },
              {
                id: 't-gram',
                title: 'Grammar: Parts of Speech, Tenses & Concord',
                strand: 'Grammar & Usage',
                subStrand: null,
                schoolYear: 'SHS 1',
                lessonReady: false,
                lessonStatus: null,
                estimatedMinutes: 10,
                progressStatus: 'not_started',
                positionPct: 0,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const { container } = renderRoute('/courses/subj-eng');
    await waitFor(() => {
      expect(screen.getByText('Reading Comprehension & Summary Writing')).toBeTruthy();
    });
    expect(screen.getByText('Tap a topic to read the lesson.')).toBeTruthy();
    expect(screen.queryByText(/Click Revise with AWAL/i)).toBeNull();
    expect(screen.getByText('Grammar: Parts of Speech, Tenses & Concord')).toBeTruthy();

    const link = screen.getByRole('link', { name: /Reading Comprehension & Summary Writing/i });
    expect(link.getAttribute('href')).toBe('/subjects/subj-eng/topics/t-comp');
    expect(container.querySelector('.truncate')).toBeNull();
  });

  it('renders readable TopicLessonPage with Check Yourself reveal and controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/shs/lessons/t-comp')) {
        return new Response(
          JSON.stringify({
            topic: {
              id: 't-comp',
              title: 'Reading Comprehension & Summary Writing',
              strand: 'Reading',
              subStrand: 'Summary',
              schoolYear: 'SHS 1',
              subjectId: 'cat-eng',
              subjectName: 'English Language',
              syllabusVersion: 'NaCCA-2024',
            },
            lesson: {
              id: 'les-1',
              status: 'approved',
              version: 1,
              model: 'gemini-test',
              promptVersion: 'shs-lesson-v1',
              generatedAt: new Date().toISOString(),
              reviewedAt: new Date().toISOString(),
              content: {
                title: 'Reading Comprehension & Summary Writing',
                subjectName: 'English Language',
                schoolYear: 'SHS 1',
                strand: 'Reading',
                subStrand: 'Summary',
                estimatedMinutes: 8,
                objectives: ['Find main ideas', 'Write concise summaries'],
                introduction: 'Learn how to read passages actively for WASSCE.',
                sections: [
                  {
                    id: 's1',
                    heading: 'Active Reading',
                    body: 'Underline key ideas as you read.',
                    keyTerms: [
                      { term: 'Skimming', definition: 'Reading quickly for the main idea.' },
                    ],
                    formulaOrRule: 'Read questions first.',
                    localExample: 'A short passage about Kumasi Central Market.',
                  },
                ],
                workedExamples: [
                  {
                    id: 'ex1',
                    title: 'Finding the Main Idea',
                    problem: 'Identify the topic sentence.',
                    steps: ['Look at sentence 1'],
                    finalAnswer: 'The first sentence states the core point.',
                  },
                ],
                commonMistakes: ['Lifting whole sentences verbatim'],
                rememberThis: ['Use your own words'],
                checkYourself: [
                  {
                    id: 'q1',
                    question: 'What is skimming?',
                    options: ['Reading quickly for main idea', 'Sleeping'],
                    answer: 'Reading quickly for main idea',
                    explanation: 'Skimming gives the overall picture.',
                  },
                ],
                disclaimer: 'AI-prepared study notes. Check with your teacher and textbook.',
              },
            },
            progress: { status: 'in_progress', positionPct: 20, timeSpentSeconds: 30 },
            prevTopic: null,
            nextTopic: { id: 't-gram', title: 'Grammar: Parts of Speech, Tenses & Concord' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    });

    renderRoute('/subjects/subj-eng/topics/t-comp');
    await waitFor(() => {
      expect(screen.getByText('Reading Comprehension & Summary Writing')).toBeTruthy();
    });
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('What you will learn')).toBeTruthy();
    expect(screen.getByText('Check Yourself')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tap to reveal answer/i }));
    expect(screen.getByText(/Answer: Reading quickly for main idea/i)).toBeTruthy();
  });

  it('shows Preparing state when queued/generating and fallback on failure', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/shs/lessons/t-queued')) {
        calls += 1;
        return new Response(
          JSON.stringify({
            jobStatus: 'generating',
            error: null,
            topic: {
              id: 't-queued',
              title: 'Quadratic Equations',
              strand: 'Algebra',
              subStrand: null,
              schoolYear: 'SHS 2',
              subjectId: 'cat-math',
              subjectName: 'Core Mathematics',
              syllabusVersion: 'NaCCA-2024',
            },
            lesson: null,
            progress: { status: 'not_started', positionPct: 0, timeSpentSeconds: 0 },
            prevTopic: null,
            nextTopic: null,
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/shs/lessons/t-failed')) {
        return new Response(
          JSON.stringify({
            jobStatus: 'failed',
            error: 'AI service is busy right now. Please wait a moment and try again.',
            topic: {
              id: 't-failed',
              title: 'Organic Chemistry',
              strand: 'Chemistry of Carbon',
              subStrand: null,
              schoolYear: 'SHS 3',
              subjectId: 'cat-chem',
              subjectName: 'Chemistry',
              syllabusVersion: 'NaCCA-2024',
            },
            lesson: null,
            progress: { status: 'not_started', positionPct: 0, timeSpentSeconds: 0 },
            prevTopic: null,
            nextTopic: null,
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const qView = renderRoute('/subjects/subj-math/topics/t-queued');
    await waitFor(() => {
      expect(screen.getByText('Quadratic Equations')).toBeTruthy();
    });
    expect(screen.getByText(/Preparing your lesson/i)).toBeTruthy();
    expect(calls).toBeGreaterThanOrEqual(1);
    qView.unmount();

    renderRoute('/subjects/subj-chem/topics/t-failed');
    await waitFor(() => {
      expect(screen.getByText('Could not prepare this lesson')).toBeTruthy();
    });
    expect(screen.getByText('Organic Chemistry')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ask AWAL about this topic/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Report problem/i })).toBeTruthy();
  });
});
