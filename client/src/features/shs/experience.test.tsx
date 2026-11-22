import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue, type AuthUser } from '../../app/AuthContext';
import { EXPERIENCE_CONFIG } from '../../app/experience';
import { BottomNav } from '../../app/layouts/BottomNav';
import { Sidebar } from '../../app/layouts/Sidebar';
import { ToastProvider } from '../../design';
import { CourseFormModal } from '../courses/CourseFormModal';
import { ProfileDetailsForm } from '../profile/ProfileDetailsForm';
import { ShsDashboardPage } from './ShsDashboardPage';

const UNIVERSITY_ONLY_TERMS = [
  /\bCGPA\b/i,
  /\bGPA\b/i,
  /\bCredit hours\b/i,
  /\bLecturer\b/i,
  /\bCourse code\b/i,
  /\bLecture Slides\b/i,
];

function makeAuth(
  learnerType: 'university' | 'shs',
  role: AuthUser['role'] = 'student',
): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'u-1',
      email: 'student@learnspace.edu',
      name: 'Kwame Boateng',
      role,
      emailVerified: true,
      avatarUrl: null,
      learnerType,
      schoolYear: learnerType === 'shs' ? 'SHS 2' : null,
      programme: learnerType === 'shs' ? 'General Science' : 'BSc Computer Science',
      ageGroup: learnerType === 'shs' ? 'under_18' : 'adult_18_plus',
      guardianConsentStatus: learnerType === 'shs' ? 'given' : 'not_required',
    },
    setSession: () => undefined,
    updateUser: () => undefined,
    clearSession: () => undefined,
    logout: async () => undefined,
    markEmailVerified: () => undefined,
  };
}

function renderWithAuth(
  ui: React.ReactElement,
  learnerType: 'university' | 'shs',
  initialEntry = '/',
  role: AuthUser['role'] = 'student',
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={makeAuth(learnerType, role)}>
          <ToastProvider>{ui}</ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Central Experience Config & SHS UI Separation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines distinct SHS vs University labels, nav, and quick actions in EXPERIENCE_CONFIG', () => {
    expect(EXPERIENCE_CONFIG.shs.labels.coursePlural).toBe('Subjects');
    expect(EXPERIENCE_CONFIG.shs.labels.teacher).toBe('Teacher');
    expect(EXPERIENCE_CONFIG.shs.labels.term).toBe('Term');
    expect(EXPERIENCE_CONFIG.shs.labels.slides).toBe('Class notes and handouts');
    expect(EXPERIENCE_CONFIG.shs.features.showGpa).toBe(false);
    expect(EXPERIENCE_CONFIG.shs.nav.mainNav.some((n) => n.to === '/grades')).toBe(false);
    expect(EXPERIENCE_CONFIG.shs.aiQuickActions.map((a) => a.label)).toContain('Test me');

    expect(EXPERIENCE_CONFIG.university.labels.coursePlural).toBe('Courses');
    expect(EXPERIENCE_CONFIG.university.features.showGpa).toBe(true);
    expect(EXPERIENCE_CONFIG.university.nav.mainNav.some((n) => n.to === '/grades')).toBe(true);
  });

  it('renders SHS navigation and hides university-only items', () => {
    const { container } = renderWithAuth(
      <>
        <Sidebar />
        <BottomNav />
      </>,
      'shs',
    );
    expect(screen.getAllByText('Subjects').length).toBeGreaterThan(0);
    expect(screen.getByText('Exam Prep (WASSCE)')).toBeTruthy();
    expect(screen.queryByText('Grades')).toBeNull();
    for (const rx of UNIVERSITY_ONLY_TERMS) {
      expect(container.textContent).not.toMatch(rx);
    }
  });

  it('renders CourseFormModal and ProfileDetailsForm with zero university-only words for SHS', () => {
    const { container } = renderWithAuth(
      <>
        <CourseFormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />
        <ProfileDetailsForm />
      </>,
      'shs',
    );
    expect(screen.getByText(/Add subject/i)).toBeTruthy();
    expect(screen.getByText(/Teacher \(optional\)/i)).toBeTruthy();
    expect(screen.getByText(/Term \(optional\)/i)).toBeTruthy();
    for (const rx of UNIVERSITY_ONLY_TERMS) {
      expect(container.textContent).not.toMatch(rx);
    }
  });

  it('renders ShsDashboardPage in admin demo preview mode without university-only terms', async () => {
    const { container } = renderWithAuth(
      <ShsDashboardPage />,
      'university',
      '/?preview=shs',
      'admin',
    );
    await waitFor(() => {
      expect(screen.getByText(/Admin Preview \(Read-Only\)/i)).toBeTruthy();
    });
    expect(screen.getByText(/WASSCE Countdown/i)).toBeTruthy();
    expect(screen.getByText(/Daily Challenge/i)).toBeTruthy();
    for (const rx of UNIVERSITY_ONLY_TERMS) {
      expect(container.textContent).not.toMatch(rx);
    }
  });
});
