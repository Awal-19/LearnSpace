import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { GradesPage } from './GradesPage';
import type { GpaOverviewBundle, GradingScaleConfig, GradingScalePreset } from './gpaApi';

const DEFAULT_SCALE: GradingScaleConfig = {
  id: 'scale-4',
  name: 'University 4.0 Scale',
  maxGpa: 4.0,
  retakePolicy: 'latest',
  isDefault: true,
  boundaries: [
    { label: 'A', minScore: 80, maxScore: 100, gradePoint: 4.0, isPass: true },
    { label: 'B+', minScore: 75, maxScore: 79.99, gradePoint: 3.5, isPass: true },
    { label: 'B', minScore: 70, maxScore: 74.99, gradePoint: 3.0, isPass: true },
    { label: 'C', minScore: 60, maxScore: 69.99, gradePoint: 2.0, isPass: true },
    { label: 'F', minScore: 0, maxScore: 59.99, gradePoint: 0.0, isPass: false },
  ],
  degreeClasses: [
    { label: 'First Class', minGpa: 3.6 },
    { label: 'Second Class Upper', minGpa: 3.0 },
  ],
};

const PRESETS: GradingScalePreset[] = [
  { key: 'default_4_0', ...DEFAULT_SCALE },
  {
    key: 'scale_5_0',
    name: '5.0 Scale',
    maxGpa: 5.0,
    retakePolicy: 'latest',
    boundaries: [
      { label: 'A', minScore: 70, maxScore: 100, gradePoint: 5.0, isPass: true },
      { label: 'B', minScore: 60, maxScore: 69.99, gradePoint: 4.0, isPass: true },
      { label: 'F', minScore: 0, maxScore: 59.99, gradePoint: 0.0, isPass: false },
    ],
    degreeClasses: [{ label: 'First Class', minGpa: 4.5 }],
  },
];

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setAccessToken('test-token');
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/grades']}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('GradesPage & GPA Calculator UI', () => {
  it('renders 4.0 scale empty state, adds grade records, shows retakes & 0-credit courses, and updates scale', async () => {
    const user = userEvent.setup();
    let scale = { ...DEFAULT_SCALE };
    const createdBodies: unknown[] = [];
    const scaleUpdates: unknown[] = [];

    let overviewState: GpaOverviewBundle = {
      activeScale: scale,
      scales: [scale],
      presets: PRESETS,
      overview: {
        totalCourses: 0,
        completedGpaCredits: 0,
        totalAttemptedCredits: 0,
        totalQualityPoints: 0,
        cgpa: null,
        rawCgpa: null,
        currentClassLabel: null,
        semesters: [],
        trend: [],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes('/courses')) return Response.json([]);
      if (url.endsWith('/gpa/overview')) return Response.json(overviewState);

      if (url.endsWith('/gpa/records') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        createdBodies.push(body);
        overviewState = {
          ...overviewState,
          overview: {
            totalCourses: 3,
            completedGpaCredits: 6,
            totalAttemptedCredits: 9,
            totalQualityPoints: 21,
            cgpa: 3.5,
            rawCgpa: 3.5,
            currentClassLabel: 'Second Class Upper',
            semesters: [
              {
                semester: 'Year 1 Semester 1',
                semesterOrder: 1,
                courseCount: 2,
                gpaCredits: 3,
                totalCredits: 3,
                qualityPoints: 0,
                semesterGpa: 0.0,
                cumulativeGpa: 0.0,
                cumulativeCredits: 3,
                records: [
                  {
                    id: 'r1',
                    courseId: null,
                    scaleId: scale.id,
                    semester: 'Year 1 Semester 1',
                    semesterOrder: 1,
                    courseCode: 'CSCD 101',
                    courseTitle: 'Programming I',
                    creditHours: 3,
                    score: 40,
                    gradeLabel: 'F',
                    gradePoint: 0,
                    excludeFromGpa: false,
                    isRetake: false,
                    retakeGroupKey: 'CSCD101',
                    createdAt: new Date().toISOString(),
                    qualityPoints: 0,
                    countsInSemesterGpa: true,
                    countsInCgpa: false,
                    supersededByRetake: true,
                    effectiveRetakeKey: 'CSCD101',
                  },
                  {
                    id: 'r2',
                    courseId: null,
                    scaleId: scale.id,
                    semester: 'Year 1 Semester 1',
                    semesterOrder: 1,
                    courseCode: 'UGRC 100',
                    courseTitle: 'Orientation',
                    creditHours: 0,
                    score: 85,
                    gradeLabel: 'A',
                    gradePoint: 4,
                    excludeFromGpa: false,
                    isRetake: false,
                    retakeGroupKey: null,
                    createdAt: new Date().toISOString(),
                    qualityPoints: 0,
                    countsInSemesterGpa: false,
                    countsInCgpa: false,
                    supersededByRetake: false,
                    effectiveRetakeKey: null,
                  },
                ],
              },
              {
                semester: 'Year 1 Semester 2',
                semesterOrder: 2,
                courseCount: 1,
                gpaCredits: 3,
                totalCredits: 3,
                qualityPoints: 10.5,
                semesterGpa: 3.5,
                cumulativeGpa: 3.5,
                cumulativeCredits: 6,
                records: [
                  {
                    id: 'r3',
                    courseId: null,
                    scaleId: scale.id,
                    semester: 'Year 1 Semester 2',
                    semesterOrder: 2,
                    courseCode: 'CSCD 101',
                    courseTitle: 'Programming I',
                    creditHours: 3,
                    score: 77,
                    gradeLabel: 'B+',
                    gradePoint: 3.5,
                    excludeFromGpa: false,
                    isRetake: true,
                    retakeGroupKey: 'CSCD101',
                    createdAt: new Date().toISOString(),
                    qualityPoints: 10.5,
                    countsInSemesterGpa: true,
                    countsInCgpa: true,
                    supersededByRetake: false,
                    effectiveRetakeKey: 'CSCD101',
                  },
                ],
              },
            ],
            trend: [
              {
                semester: 'Year 1 Semester 1',
                semesterOrder: 1,
                semesterGpa: 0,
                cumulativeGpa: 0,
                gpaCredits: 3,
                cumulativeCredits: 3,
              },
              {
                semester: 'Year 1 Semester 2',
                semesterOrder: 2,
                semesterGpa: 3.5,
                cumulativeGpa: 3.5,
                gpaCredits: 3,
                cumulativeCredits: 6,
              },
            ],
          },
        };
        return Response.json(
          { record: overviewState.overview.semesters[0]!.records[0], ...overviewState },
          { status: 201 },
        );
      }

      if (url.includes('/gpa/scales/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        scaleUpdates.push(body);
        scale = { ...scale, name: body.name, maxGpa: body.maxGpa };
        overviewState = { ...overviewState, activeScale: scale, scales: [scale] };
        return Response.json(scale);
      }

      return Response.json({});
    });

    renderWithQuery(<GradesPage />);

    expect(await screen.findByText('No grades recorded yet')).toBeInTheDocument();
    expect(screen.getByText('University 4.0 Scale', { selector: 'strong' })).toBeInTheDocument();

    // Add a grade record
    await user.click(screen.getByRole('button', { name: 'Add grade' }));
    const modal = screen.getByRole('dialog', { name: 'Add course grade' });
    await user.type(within(modal).getByLabelText('Course code'), 'CSCD 101');
    await user.type(within(modal).getByLabelText('Course title'), 'Programming I');
    await user.type(within(modal).getByLabelText(/Percentage score/i), '85');
    expect(within(modal).getByText(/A \(4\.00 pts\)/)).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'Add grade' }));
    await waitFor(() => {
      expect(createdBodies).toHaveLength(1);
    });

    expect(await screen.findByText('Superseded in CGPA')).toBeInTheDocument();
    expect(screen.getByText('0 credits')).toBeInTheDocument();
    expect(screen.getByText('Second Class Upper')).toBeInTheDocument();

    // Configure scale preset to 5.0 Scale
    await user.click(screen.getByRole('button', { name: 'Configure scale' }));
    const scaleModal = screen.getByRole('dialog', { name: 'Configure grading scale' });
    await user.click(within(scaleModal).getByRole('button', { name: '5.0 Scale' }));
    await user.click(within(scaleModal).getByRole('button', { name: /Save & set active/i }));

    await waitFor(() => {
      expect(scaleUpdates).toHaveLength(1);
    });
    expect(await screen.findByText('5.0 Scale', { selector: 'strong' })).toBeInTheDocument();
  }, 15_000);

  it('runs "What do I need?" target calculator for achievable and impossible goals', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes('/courses')) return Response.json([]);
      if (url.endsWith('/gpa/overview')) {
        return Response.json({
          activeScale: DEFAULT_SCALE,
          scales: [DEFAULT_SCALE],
          presets: PRESETS,
          overview: {
            totalCourses: 2,
            completedGpaCredits: 60,
            totalAttemptedCredits: 60,
            totalQualityPoints: 192,
            cgpa: 3.2,
            rawCgpa: 3.2,
            currentClassLabel: 'Second Class Upper',
            semesters: [],
            trend: [],
          },
        });
      }
      if (url.endsWith('/gpa/what-if') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { targetCgpa?: number };
        if ((body.targetCgpa ?? 0) >= 3.9) {
          return Response.json({
            possible: false,
            alreadyAchieved: false,
            targetCgpa: 3.9,
            targetClassLabel: null,
            currentCgpa: 3.2,
            completedGpaCredits: 60,
            remainingCredits: 15,
            maxAchievableCgpa: 3.36,
            minPossibleCgpa: 2.56,
            requiredAvgGpa: 6.7,
            suggestedMinGrade: null,
            courseBreakdown: [],
            message: 'Impossible with 15 remaining credits: average GPA exceeds max 4.00.',
          });
        }
        return Response.json({
          possible: true,
          alreadyAchieved: false,
          targetCgpa: 3.3,
          targetClassLabel: null,
          currentCgpa: 3.2,
          completedGpaCredits: 60,
          remainingCredits: 15,
          maxAchievableCgpa: 3.36,
          minPossibleCgpa: 2.56,
          requiredAvgGpa: 3.7,
          suggestedMinGrade: { label: 'A', gradePoint: 4.0 },
          courseBreakdown: [],
          message: 'You need an average GPA of 3.70 across your 15 remaining credits.',
        });
      }
      return Response.json({});
    });

    renderWithQuery(<GradesPage />);
    expect(await screen.findByText('3.20')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'What do I need?' }));
    const targetInput = screen.getByLabelText(/Desired CGPA/i);
    await user.clear(targetInput);
    await user.type(targetInput, '3.30');
    await user.click(screen.getByRole('button', { name: 'Calculate required grades' }));

    expect(await screen.findByText('Target achievable')).toBeInTheDocument();
    expect(screen.getByText('3.70')).toBeInTheDocument();

    await user.clear(targetInput);
    await user.type(targetInput, '3.90');
    await user.click(screen.getByRole('button', { name: 'Calculate required grades' }));

    expect(await screen.findByText('Target impossible with current credits')).toBeInTheDocument();
  });
});
