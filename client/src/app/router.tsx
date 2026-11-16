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
const ProfilePage = lazy(() =>
  import('../features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
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
    path: 'documents',
    element: withSuspense(<DocumentsPage />),
  },
  {
    path: 'documents/:documentId',
    element: withSuspense(<DocumentsPage />),
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

export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ path: '/', element: <AppLayout />, children: appRoutes }],
  },
  ...devRoutes,
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);

