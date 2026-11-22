import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Skeleton } from '../design';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignupPage } from '../features/auth/SignupPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { BasePathProvider } from './basePath';
import { RequireAuth } from './RequireAuth';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';

const DesignGalleryPage = lazy(() => import('../pages/DesignGalleryPage'));
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ChatPage = lazy(() =>
  import('../features/chat/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const NotesPage = lazy(() =>
  import('../features/notes/NotesPage').then((m) => ({ default: m.NotesPage })),
);
const PlannerPage = lazy(() =>
  import('../features/planner/PlannerPage').then((m) => ({ default: m.PlannerPage })),
);
const FocusPage = lazy(() =>
  import('../features/focus/FocusPage').then((m) => ({ default: m.FocusPage })),
);
const StudyPage = lazy(() =>
  import('../features/study/StudyPage').then((m) => ({ default: m.StudyPage })),
);
const DocumentsPage = lazy(() =>
  import('../features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const CommunityHomePage = lazy(() =>
  import('../features/community/CommunityHomePage').then((m) => ({
    default: m.CommunityHomePage,
  })),
);
const CourseCommunityPage = lazy(() =>
  import('../features/community/CourseCommunityPage').then((m) => ({
    default: m.CourseCommunityPage,
  })),
);
const StudyGroupPage = lazy(() =>
  import('../features/community/StudyGroupPage').then((m) => ({ default: m.StudyGroupPage })),
);
const RequireAdmin = lazy(() =>
  import('../features/admin/RequireAdmin').then((m) => ({ default: m.RequireAdmin })),
);
const AdminLayout = lazy(() =>
  import('../features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminOverviewPage = lazy(() =>
  import('../features/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminUsersPage = lazy(() =>
  import('../features/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminUserDetailPage = lazy(() =>
  import('../features/admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })),
);
const AdminAiUsagePage = lazy(() =>
  import('../features/admin/AdminAiUsagePage').then((m) => ({ default: m.AdminAiUsagePage })),
);
const AdminContentPage = lazy(() =>
  import('../features/admin/AdminContentPage').then((m) => ({ default: m.AdminContentPage })),
);
const AdminLearningPage = lazy(() =>
  import('../features/admin/AdminLearningPage').then((m) => ({ default: m.AdminLearningPage })),
);
const AdminShsPage = lazy(() =>
  import('../features/admin/AdminShsPage').then((m) => ({ default: m.AdminShsPage })),
);
const AdminAnnouncementsPage = lazy(() =>
  import('../features/admin/AdminAnnouncementsPage').then((m) => ({
    default: m.AdminAnnouncementsPage,
  })),
);
const AdminFeedbackPage = lazy(() =>
  import('../features/admin/AdminFeedbackPage').then((m) => ({ default: m.AdminFeedbackPage })),
);
const AdminAuditLogPage = lazy(() =>
  import('../features/admin/AdminAuditLogPage').then((m) => ({ default: m.AdminAuditLogPage })),
);
const AdminSystemPage = lazy(() =>
  import('../features/admin/AdminSystemPage').then((m) => ({ default: m.AdminSystemPage })),
);
const AdminSettingsPage = lazy(() =>
  import('../features/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
);
const AdminReportsPage = lazy(() =>
  import('../features/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })),
);
const AdminTeamPage = lazy(() =>
  import('../features/admin/AdminTeamPage').then((m) => ({ default: m.AdminTeamPage })),
);
const AdminPlatformSettingsPage = lazy(() =>
  import('../features/admin/AdminPlatformSettingsPage').then((m) => ({
    default: m.AdminPlatformSettingsPage,
  })),
);
const AcceptAdminInvitePage = lazy(() =>
  import('../features/auth/AcceptAdminInvitePage').then((m) => ({
    default: m.AcceptAdminInvitePage,
  })),
);
const ProfilePage = lazy(() =>
  import('../features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const CoursesPage = lazy(() =>
  import('../features/courses/CoursesPage').then((m) => ({ default: m.CoursesPage })),
);
const CourseDetailPage = lazy(() =>
  import('../features/courses/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })),
);
const TimetablePage = lazy(() =>
  import('../features/timetable/TimetablePage').then((m) => ({ default: m.TimetablePage })),
);
const ExamsPage = lazy(() =>
  import('../features/exams/ExamsPage').then((m) => ({ default: m.ExamsPage })),
);
const GradesPage = lazy(() =>
  import('../features/gpa/GradesPage').then((m) => ({ default: m.GradesPage })),
);

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<Skeleton className="h-40 w-full" />}>{node}</Suspense>;
}

/** Routes inside the authenticated shell. Paths are relative to the shell's mount point. */
export const appRoutes: RouteObject[] = [
  {
    index: true,
    element: withSuspense(<DashboardPage />),
  },
  {
    path: 'courses',
    element: withSuspense(<CoursesPage />),
  },
  {
    path: 'courses/:courseId',
    element: withSuspense(<CourseDetailPage />),
  },
  {
    path: 'chat',
    element: withSuspense(<ChatPage />),
  },
  {
    path: 'chat/:conversationId',
    element: withSuspense(<ChatPage />),
  },
  {
    path: 'notes',
    element: withSuspense(<NotesPage />),
  },
  {
    path: 'notes/:noteId',
    element: withSuspense(<NotesPage />),
  },
  {
    path: 'planner',
    element: withSuspense(<PlannerPage />),
  },
  {
    path: 'timetable',
    element: withSuspense(<TimetablePage />),
  },
  {
    path: 'exams',
    element: withSuspense(<ExamsPage />),
  },
  {
    path: 'focus',
    element: withSuspense(<FocusPage />),
  },
  {
    path: 'study',
    element: withSuspense(<StudyPage />),
  },
  {
    path: 'study/*',
    element: withSuspense(<StudyPage />),
  },
  {
    path: 'grades',
    element: withSuspense(<GradesPage />),
  },
  {
    path: 'documents',
    element: withSuspense(<DocumentsPage />),
  },
  {
    path: 'documents/:documentId',
    element: withSuspense(<DocumentsPage />),
  },
  {
    path: 'community',
    element: withSuspense(<CommunityHomePage />),
  },
  {
    path: 'community/courses/:communityId',
    element: withSuspense(<CourseCommunityPage />),
  },
  {
    path: 'community/groups/:groupId',
    element: withSuspense(<StudyGroupPage />),
  },
  {
    path: 'profile',
    element: withSuspense(<ProfilePage />),
  },
  {
    path: 'settings',
    element: withSuspense(<SettingsPage />),
  },
  { path: 'more', element: <MorePage /> },
];

const DEV_SHELL = '/dev/shell';

/** Developer-only previews. `import.meta.env.DEV` is false in production, so these are tree-shaken out. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/design',
        element: (
          <Suspense fallback={<Skeleton className="m-6 h-40" />}>
            <DesignGalleryPage />
          </Suspense>
        ),
      },
      {
        path: DEV_SHELL,
        element: (
          <BasePathProvider base={DEV_SHELL}>
            <AppLayout base={DEV_SHELL} />
          </BasePathProvider>
        ),
        children: appRoutes,
      },
    ]
  : [];

const TermsPage = lazy(() =>
  import('../features/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
);
const PrivacyPolicyPage = lazy(() =>
  import('../features/legal/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })),
);
const GuardianConsentGatePage = lazy(() =>
  import('../features/shs/GuardianConsentGatePage').then((m) => ({
    default: m.GuardianConsentGatePage,
  })),
);
const GuardianConsentActionPage = lazy(() =>
  import('../features/shs/GuardianConsentActionPage').then((m) => ({
    default: m.GuardianConsentActionPage,
  })),
);

export const routes: RouteObject[] = [
  { path: '/terms-and-conditions', element: withSuspense(<TermsPage />) },
  { path: '/privacy-policy', element: withSuspense(<PrivacyPolicyPage />) },
  { path: '/guardian-consent', element: withSuspense(<GuardianConsentActionPage />) },
  { path: '/guardian-consent-required', element: withSuspense(<GuardianConsentGatePage />) },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/accept-admin-invite', element: withSuspense(<AcceptAdminInvitePage />) },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ path: '/', element: <AppLayout />, children: appRoutes }],
  },
  {
    path: '/admin',
    element: withSuspense(<RequireAdmin />),
    children: [
      {
        element: withSuspense(<AdminLayout />),
        children: [
          { index: true, element: withSuspense(<AdminOverviewPage />) },
          { path: 'users', element: withSuspense(<AdminUsersPage />) },
          { path: 'users/:userId', element: withSuspense(<AdminUserDetailPage />) },
          { path: 'ai-usage', element: withSuspense(<AdminAiUsagePage />) },
          { path: 'content', element: withSuspense(<AdminContentPage />) },
          { path: 'learning', element: withSuspense(<AdminLearningPage />) },
          { path: 'shs', element: withSuspense(<AdminShsPage />) },
          { path: 'announcements', element: withSuspense(<AdminAnnouncementsPage />) },
          { path: 'feedback', element: withSuspense(<AdminFeedbackPage />) },
          { path: 'audit-log', element: withSuspense(<AdminAuditLogPage />) },
          { path: 'system', element: withSuspense(<AdminSystemPage />) },
          { path: 'settings', element: withSuspense(<AdminSettingsPage />) },
          { path: 'reports', element: withSuspense(<AdminReportsPage />) },
          { path: 'team', element: withSuspense(<AdminTeamPage />) },
          { path: 'platform-settings', element: withSuspense(<AdminPlatformSettingsPage />) },
        ],
      },
    ],
  },
  ...devRoutes,
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
