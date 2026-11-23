import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Compass,
  Hash,
  MessageSquare,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { useExperience } from '../../app/experience';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchCommunityDiscover, joinCourseCommunity, toggleFollowStudent } from './communityApi';
import { CommunityLayout } from './CommunityLayout';

export function CommunityDiscoverPage() {
  const path = useAppPath();
  const exp = useExperience();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['community', 'discover', search],
    queryFn: () => fetchCommunityDiscover(search),
    staleTime: 20_000,
  });

  const handleJoin = async (communityId: string, displayName: string) => {
    setBusyId(communityId);
    try {
      await joinCourseCommunity(communityId);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: `Joined ${displayName}` });
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
        title: 'Could not follow student',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <CommunityLayout>
      <GlassCard className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary-500" aria-hidden="true" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                Discover {exp.isShs ? 'SHS Spaces' : 'Study Spaces'}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Explore {exp.labels.coursePluralLower}, popular study topics, and peers in your{' '}
              {exp.isShs ? 'SHS network' : 'university & college community'}.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${exp.labels.coursePluralLower} or students...`}
              aria-label="Search Discover"
              className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-xs text-fg placeholder:text-muted focus:border-primary-400 focus:outline-none"
            />
          </div>
        </div>
      </GlassCard>

      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState
          title="Could not load Discover"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {/* Popular Topic Tags */}
          {query.data.popularTags.length > 0 ? (
            <GlassCard className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary-500" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-fg">Popular Topics</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {query.data.popularTags.map((t) => (
                  <Link
                    key={t.tag}
                    to={path(`/community/discussions?q=${encodeURIComponent(t.tag)}`)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-fg transition-colors hover:border-primary-400 hover:text-primary-600"
                  >
                    <span>#{t.tag}</span>
                    <span className="text-muted">({t.count})</span>
                  </Link>
                ))}
              </div>
            </GlassCard>
          ) : null}

          {/* Subject / Course Communities */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-fg">
              {exp.labels.courseSingular} Communities
            </h2>
            {query.data.communities.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={BookOpen}
                  title={`No matching ${exp.labels.coursePluralLower} found`}
                  description={`Add a ${exp.labels.courseLower} on your ${exp.labels.coursePlural} page to create its community space.`}
                  action={
                    <Link to={path('/courses')}>
                      <Button size="sm">Go to {exp.labels.coursePlural}</Button>
                    </Link>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {query.data.communities.map((comm) => (
                  <GlassCard
                    key={comm.id}
                    className="flex flex-col justify-between gap-3 p-4 transition-all hover:border-primary-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={path(`/community/courses/${comm.id}`)}
                          className="font-display text-base font-semibold text-fg hover:text-primary-600"
                        >
                          {comm.displayName}
                        </Link>
                        {comm.isJoined ? <Badge tone="success">Joined</Badge> : null}
                      </div>
                      <p className="text-xs text-muted">
                        {comm.universityName ?? (exp.isShs ? 'Ghana SHS' : 'Global community')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-3 text-xs text-muted">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {comm.memberCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          {comm.postCount}
                        </span>
                        <span>{comm.groupCount} groups</span>
                      </div>

                      {comm.isJoined ? (
                        <Link to={path(`/community/courses/${comm.id}`)}>
                          <Button type="button" size="sm" variant="secondary">
                            Open
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          loading={busyId === comm.id}
                          onClick={() => void handleJoin(comm.id, comm.displayName)}
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </section>

          {/* Suggested & Discoverable Students */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-fg">
              {exp.isShs ? 'SHS Classmates' : 'Students to Connect With'}
            </h2>
            {query.data.students.length === 0 ? (
              <Card className="p-5 text-xs text-muted">
                No matching classmates visible right now.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {query.data.students.map((peer) => (
                  <GlassCard key={peer.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={peer.name} src={peer.avatarUrl} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-fg">{peer.name}</p>
                          {peer.badge ? (
                            <Badge
                              tone="success"
                              className="inline-flex items-center gap-1 text-[10px]"
                            >
                              <Award className="h-3 w-3" aria-hidden="true" />
                              {peer.badge}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted">{peer.subtitle}</p>
                        {peer.sharedCount > 0 ? (
                          <p className="text-[11px] text-primary-600 dark:text-primary-400">
                            {peer.sharedCount} shared {exp.labels.courseLower}
                            {peer.sharedCount > 1 ? 's' : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={peer.isFollowing ? 'secondary' : 'primary'}
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
                  </GlassCard>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </CommunityLayout>
  );
}
