import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Award,
  BookOpen,
  Compass,
  Flame,
  Home,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { useExperience } from '../../app/experience';
import { Avatar, Badge, Button, Card, GlassCard, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  fetchCommunityDashboard,
  joinCourseCommunity,
  joinStudyGroup,
  toggleFollowStudent,
  type CommunityDashboardResponse,
} from './communityApi';
import { CommunityRulesModal } from './CommunityRulesModal';

const COMMUNITY_NAV = [
  { to: '/community', label: 'Home', icon: Home, end: true },
  { to: '/community/discover', label: 'Discover', icon: Compass },
  { to: '/community/groups', label: 'Study Groups', icon: Users },
  { to: '/community/discussions', label: 'Discussions', icon: MessageSquare },
  { to: '/community/leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function CommunityLayout({
  children,
  dashboardOverride,
}: {
  children: ReactNode;
  dashboardOverride?: CommunityDashboardResponse;
}) {
  const path = useAppPath();
  const exp = useExperience();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dashQuery = useQuery({
    queryKey: ['community', 'dashboard'],
    queryFn: fetchCommunityDashboard,
    staleTime: 20_000,
    enabled: !dashboardOverride,
  });

  const dashboard = dashboardOverride ?? dashQuery.data;

  const handleJoinSubject = async (communityId: string, name: string) => {
    setBusyId(communityId);
    try {
      await joinCourseCommunity(communityId);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: `Joined ${name}` });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not join',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleJoinGroup = async (groupId: string, name: string) => {
    setBusyId(groupId);
    try {
      await joinStudyGroup(groupId);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: `Joined ${name}` });
      navigate(path(`/community/groups/${groupId}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not join study group',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleFollow = async (userId: string) => {
    setBusyId(userId);
    try {
      const res = await toggleFollowStudent(userId);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({
        kind: 'success',
        title: res.following ? 'Following classmate' : 'Unfollowed classmate',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update follow',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      {/* Mobile / Tablet horizontal nav */}
      <nav
        aria-label="Study Community Navigation"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:hidden"
      >
        {COMMUNITY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={path(item.to)}
              end={item.end}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'border border-line bg-surface text-muted hover:bg-surface2 hover:text-fg'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* 3-Column Social Learning Dashboard */}
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Left Sidebar Navigation (Desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <GlassCard className="space-y-1.5 p-3">
              <div className="px-2.5 pb-2">
                <p className="font-display text-sm font-semibold text-fg">
                  {exp.isShs ? 'SHS Study Spaces' : 'Study Community'}
                </p>
                <p className="text-[11px] text-muted">
                  {exp.isShs ? 'Ghana SHS & WASSCE peers' : 'University & College peers'}
                </p>
              </div>
              <nav aria-label="Study Community Sidebar" className="space-y-1">
                {COMMUNITY_NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={path(item.to)}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-muted hover:bg-surface2 hover:text-fg'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </GlassCard>

            <GlassCard className="space-y-2.5 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">Community Safety</span>
                <ShieldCheck className="h-4 w-4 text-primary-500" aria-hidden="true" />
              </div>
              <p className="leading-relaxed text-muted">
                {exp.isShs
                  ? 'Verified SHS-only academic space. Personal details and external links are filtered.'
                  : 'Verified university & college academic space. Be kind and cite sources.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => setRulesOpen(true)}
              >
                Review Rules
              </Button>
            </GlassCard>
          </div>
        </aside>

        {/* Central Content / Feed */}
        <main className="min-w-0 space-y-5">{children}</main>

        {/* Right Sidebar: Trending, Suggested Groups, Popular Subjects, Suggested Students, Activities */}
        <aside className="space-y-4 lg:col-span-2 xl:col-span-1">
          {!dashboard ? (
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Trending Discussions */}
              <GlassCard className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    <h2 className="font-display text-sm font-semibold text-fg">
                      Trending Discussions
                    </h2>
                  </div>
                  <Link
                    to={path('/community/discussions')}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    See all
                  </Link>
                </div>
                {dashboard.trendingDiscussions.length === 0 ? (
                  <p className="text-xs text-muted">No discussions yet. Start the first thread!</p>
                ) : (
                  <div className="divide-y divide-line/60">
                    {dashboard.trendingDiscussions.slice(0, 4).map((post) => (
                      <Link
                        key={post.id}
                        to={path(`/community/courses/${post.communityId}?post=${post.id}`)}
                        className="block py-2 transition-colors hover:text-primary-600"
                      >
                        <p className="line-clamp-2 text-xs font-medium text-fg">{post.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {post.communityName} · {post.helpfulCount} helpful · {post.replyCount}{' '}
                          replies
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Recommended Study Groups */}
              <GlassCard className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary-500" aria-hidden="true" />
                    <h2 className="font-display text-sm font-semibold text-fg">
                      Recommended Study Groups
                    </h2>
                  </div>
                  <Link
                    to={path('/community/groups')}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Browse
                  </Link>
                </div>
                {dashboard.suggestedGroups.length === 0 ? (
                  <p className="text-xs text-muted">
                    Create a study group in any {exp.labels.courseLower} to collaborate live.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {dashboard.suggestedGroups.slice(0, 4).map((grp) => (
                      <div
                        key={grp.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface2/40 p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-fg">{grp.name}</p>
                          <p className="truncate text-[11px] text-muted">
                            {grp.communityName} · {grp.memberCount} members
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busyId === grp.id}
                          onClick={() => void handleJoinGroup(grp.id, grp.name)}
                        >
                          Join
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Popular Subjects / Courses */}
              <GlassCard className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                    <h2 className="font-display text-sm font-semibold text-fg">
                      Popular {exp.labels.coursePlural}
                    </h2>
                  </div>
                  <Link
                    to={path('/community/discover')}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Discover
                  </Link>
                </div>
                {dashboard.popularSubjects.length === 0 ? (
                  <p className="text-xs text-muted">
                    Add your {exp.labels.coursePluralLower} to unlock subject spaces.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.popularSubjects.slice(0, 5).map((subj) => (
                      <div
                        key={subj.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <Link
                          to={path(`/community/courses/${subj.id}`)}
                          className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary-600"
                        >
                          {subj.displayName}
                          <span className="ml-1.5 text-[11px] font-normal text-muted">
                            ({subj.memberCount})
                          </span>
                        </Link>
                        {subj.isJoined ? (
                          <Badge tone="success">Joined</Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            loading={busyId === subj.id}
                            onClick={() => void handleJoinSubject(subj.id, subj.displayName)}
                          >
                            Join
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Suggested Students */}
              <GlassCard className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary-500" aria-hidden="true" />
                    <h2 className="font-display text-sm font-semibold text-fg">
                      Suggested Students
                    </h2>
                  </div>
                  <Link
                    to={path('/community/discover')}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Find peers
                  </Link>
                </div>
                {dashboard.suggestedStudents.length === 0 ? (
                  <p className="text-xs text-muted">
                    More {exp.isShs ? 'SHS classmates' : 'classmates'} will appear as students join.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {dashboard.suggestedStudents.slice(0, 4).map((peer) => (
                      <div key={peer.id} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={peer.name} src={peer.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-fg">{peer.name}</p>
                            <p className="truncate text-[11px] text-muted">{peer.subtitle}</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={peer.isFollowing ? 'secondary' : 'ghost'}
                          loading={busyId === peer.id}
                          onClick={() => void handleFollow(peer.id)}
                        >
                          {peer.isFollowing ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                              Follow
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Recent Community Activities */}
              <Card className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary-500" aria-hidden="true" />
                  <h2 className="font-display text-sm font-semibold text-fg">
                    Recent Community Activity
                  </h2>
                </div>
                {dashboard.recentActivities.length === 0 ? (
                  <p className="text-xs text-muted">No recent activity yet.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {dashboard.recentActivities.slice(0, 5).map((act) => (
                      <li key={act.id} className="flex items-start gap-2 text-muted">
                        <Award
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 leading-snug">
                          <strong className="font-medium text-fg">{act.actorName}</strong>{' '}
                          {act.kind === 'resource'
                            ? 'shared resource'
                            : act.kind === 'group'
                              ? 'started study group'
                              : act.kind === 'question'
                                ? 'asked'
                                : 'posted'}{' '}
                          <span className="font-medium text-fg">{act.title}</span> in{' '}
                          {act.targetName}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </aside>
      </div>

      <CommunityRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onAccepted={() => {
          setRulesOpen(false);
          void qc.invalidateQueries({ queryKey: ['community'] });
        }}
      />
    </div>
  );
}
