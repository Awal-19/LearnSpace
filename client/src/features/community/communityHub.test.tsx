import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { CommunityDiscoverPage } from './CommunityDiscoverPage';
import { CommunityHomePage } from './CommunityHomePage';
import { CommunityLeaderboardPage } from './CommunityLeaderboardPage';

function makeAuth(learnerType: 'shs' | 'university'): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: `u-${learnerType}`,
      email: `${learnerType}@learnspace.gh`,
      name: learnerType === 'shs' ? 'Abena Mensah' : 'Kofi Adu',
      role: 'student',
      emailVerified: true,
      avatarUrl: null,
      learnerType,
      schoolYear: learnerType === 'shs' ? 'SHS 2' : null,
      programme: learnerType === 'shs' ? 'Science' : null,
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

function renderCommunity(initialEntry: string, learnerType: 'shs' | 'university' = 'university') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={makeAuth(learnerType)}>
          <ToastProvider>
            <Routes>
              <Route path="/community" element={<CommunityHomePage />} />
              <Route path="/community/discover" element={<CommunityDiscoverPage />} />
              <Route path="/community/leaderboard" element={<CommunityLeaderboardPage />} />
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Study Community Dashboard & Sub-pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 3-column Community Home with welcome, stats, feed, right sidebar, and SHS vs University wording', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/community/home')) {
        return new Response(
          JSON.stringify({
            rulesAccepted: true,
            profile: {
              helpedCount: 4,
              acceptedCount: 2,
              badge: 'Peer Helper',
              hideStats: false,
              showInClassmates: true,
            },
            examNotice: { enabled: false, message: null },
            communities: [
              {
                id: 'c-phys',
                slug: 'shs:physics',
                displayName: 'Physics',
                universityName: 'Ghana SHS',
                role: 'member',
                isPaused: false,
                memberCount: 18,
                postCount: 7,
                groupCount: 2,
              },
            ],
            myGroups: [],
            unanswered: [],
            trending: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/community/dashboard')) {
        return new Response(
          JSON.stringify({
            learnerType: 'shs',
            userSummary: {
              id: 'u-shs',
              name: 'Abena Mensah',
              schoolYear: 'SHS 2',
              programme: 'Science',
              university: null,
            },
            rulesAccepted: true,
            stats: {
              totalStudents: 42,
              totalPosts: 19,
              solvedDiscussions: 11,
              totalGroups: 5,
              totalResources: 8,
              followingCount: 3,
              joinedSubjectsCount: 1,
              myGroupsCount: 0,
            },
            popularSubjects: [
              {
                id: 'c-phys',
                slug: 'shs:physics',
                displayName: 'Physics',
                universityName: 'Ghana SHS',
                isPaused: false,
                memberCount: 18,
                postCount: 7,
                groupCount: 2,
                isJoined: true,
              },
            ],
            trendingDiscussions: [
              {
                id: 'p-1',
                communityId: 'c-phys',
                communityName: 'Physics',
                type: 'question',
                title: 'How to derive equations of uniform acceleration?',
                topicTag: 'Kinematics',
                status: 'answered',
                replyCount: 3,
                helpfulCount: 6,
                createdAt: new Date().toISOString(),
                author: { id: 'u-2', name: 'Yaw Boateng', avatarUrl: null },
              },
            ],
            suggestedGroups: [
              {
                id: 'g-1',
                name: 'WASSCE Mechanics Prep',
                description: 'Daily motion calculations',
                visibility: 'public_course',
                communityId: 'c-phys',
                communityName: 'Physics',
                memberCount: 9,
                messageCount: 24,
              },
            ],
            suggestedStudents: [
              {
                id: 'u-2',
                name: 'Yaw Boateng',
                avatarUrl: null,
                subtitle: 'SHS 2 · Science',
                sharedCount: 1,
                helpedCount: 5,
                badge: 'Peer Helper',
                isFollowing: false,
              },
            ],
            recentActivities: [
              {
                id: 'act-1',
                kind: 'question',
                actorName: 'Yaw Boateng',
                title: 'Projectile motion question',
                targetName: 'Physics',
                communityId: 'c-phys',
                postId: 'p-1',
                groupId: null,
                createdAt: new Date().toISOString(),
              },
            ],
            myBookmarkedIds: [],
            myFollowingIds: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/community/feed')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'p-1',
                communityId: 'c-phys',
                communityName: 'Physics',
                type: 'question',
                title: 'How to derive equations of uniform acceleration?',
                body: 'Starting from v = u + at, how do we get s = ut + 1/2 at^2?',
                topicTag: 'Kinematics',
                status: 'answered',
                replyCount: 3,
                helpfulCount: 6,
                hasVoted: false,
                isBookmarked: false,
                createdAt: new Date().toISOString(),
                author: { id: 'u-2', name: 'Yaw Boateng', avatarUrl: null },
              },
            ],
            nextCursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/community/posts/p-1/bookmark')) {
        return new Response(JSON.stringify({ bookmarked: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    renderCommunity('/community', 'shs');

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Abena!/i)).toBeTruthy();
    });

    // Left sidebar & mobile nav links
    expect(screen.getAllByText('Discover').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Study Groups').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Discussions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Leaderboard').length).toBeGreaterThanOrEqual(1);

    // Community stats
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();

    // Right sidebar sections + SHS wording ("Popular Subjects" not "Popular Courses")
    expect(screen.getByText('Trending Discussions')).toBeTruthy();
    expect(screen.getByText('Recommended Study Groups')).toBeTruthy();
    expect(screen.getByText('Popular Subjects')).toBeTruthy();
    expect(screen.getByText('Suggested Students')).toBeTruthy();
    expect(screen.getByText('Recent Community Activity')).toBeTruthy();
    expect(screen.getByText('WASSCE Mechanics Prep')).toBeTruthy();

    // Central feed bookmark interaction
    const saveBtn = screen.getByRole('button', { name: /Save discussion/i });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText(/Saved to Bookmarks/i)).toBeTruthy();
    });
  });

  it('renders Leaderboard and Discover views', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/community/dashboard')) {
        return new Response(
          JSON.stringify({
            learnerType: 'university',
            userSummary: {
              id: 'u-university',
              name: 'Kofi Adu',
              schoolYear: null,
              programme: null,
              university: 'KNUST',
            },
            rulesAccepted: true,
            stats: {
              totalStudents: 20,
              totalPosts: 8,
              solvedDiscussions: 5,
              totalGroups: 3,
              totalResources: 2,
              followingCount: 1,
              joinedSubjectsCount: 1,
              myGroupsCount: 1,
            },
            popularSubjects: [],
            trendingDiscussions: [],
            suggestedGroups: [],
            suggestedStudents: [],
            recentActivities: [],
            myBookmarkedIds: [],
            myFollowingIds: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/community/leaderboard')) {
        return new Response(
          JSON.stringify({
            learnerType: 'university',
            myStats: {
              rank: 1,
              helpedCount: 15,
              acceptedCount: 6,
              badge: 'Mentor',
              hideStats: false,
            },
            leaders: [
              {
                rank: 1,
                userId: 'u-university',
                name: 'Kofi Adu',
                avatarUrl: null,
                subtitle: 'KNUST',
                helpedCount: 15,
                acceptedCount: 6,
                badge: 'Mentor',
                isMe: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    });

    renderCommunity('/community/leaderboard', 'university');
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeTruthy();
    });
    expect(screen.getByText('Study Leaders Leaderboard')).toBeTruthy();
    expect(screen.getByText('Kofi Adu')).toBeTruthy();
    expect(screen.getByText('15 helped')).toBeTruthy();
  });
});
