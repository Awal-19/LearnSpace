import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Crown, Medal, Trophy } from 'lucide-react';
import { useExperience } from '../../app/experience';
import { Avatar, Badge, Card, EmptyState, ErrorState, GlassCard, Skeleton } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchCommunityLeaderboard } from './communityApi';
import { CommunityLayout } from './CommunityLayout';

export function CommunityLeaderboardPage() {
  const exp = useExperience();
  const query = useQuery({
    queryKey: ['community', 'leaderboard'],
    queryFn: fetchCommunityLeaderboard,
    staleTime: 30_000,
  });

  return (
    <CommunityLayout>
      <GlassCard className="space-y-2 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            {exp.isShs ? 'SHS Peer Helpers Leaderboard' : 'Study Leaders Leaderboard'}
          </h1>
        </div>
        <p className="text-sm text-muted">
          Celebrating students who help classmates solve questions and share quality study notes.
        </p>
      </GlassCard>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState
          title="Could not load Leaderboard"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {/* Your Standing */}
          <GlassCard className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Your Contribution Standing
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-2xl font-bold text-fg">
                  {query.data.myStats.rank ? `#${query.data.myStats.rank}` : 'Unranked'}
                </span>
                {query.data.myStats.badge ? (
                  <Badge tone="success" className="inline-flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    {query.data.myStats.badge}
                  </Badge>
                ) : null}
                {query.data.myStats.hideStats ? (
                  <Badge tone="neutral">Stats hidden in privacy settings</Badge>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-muted">Classmates Helped</p>
                <p className="font-display text-lg font-bold text-fg">
                  {query.data.myStats.helpedCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Accepted Answers</p>
                <p className="font-display text-lg font-bold text-fg">
                  {query.data.myStats.acceptedCount}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Leaderboard Table */}
          {query.data.leaders.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={Trophy}
                title="Leaderboard is warming up"
                description="Answer unanswered questions in Discussions to earn helpful votes and badges!"
              />
            </Card>
          ) : (
            <GlassCard className="divide-y divide-line/60 p-2 sm:p-4">
              {query.data.leaders.map((leader) => {
                const RankIcon = leader.rank === 1 ? Crown : leader.rank <= 3 ? Medal : null;
                return (
                  <div
                    key={leader.userId}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors ${
                      leader.isMe ? 'bg-primary-500/10' : 'hover:bg-surface2/50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-bold text-fg">
                        {RankIcon ? (
                          <RankIcon
                            className={`h-4 w-4 ${
                              leader.rank === 1
                                ? 'text-amber-500'
                                : leader.rank === 2
                                  ? 'text-slate-400'
                                  : 'text-amber-700'
                            }`}
                            aria-hidden="true"
                          />
                        ) : (
                          <span>#{leader.rank}</span>
                        )}
                      </div>
                      <Avatar name={leader.name} src={leader.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-fg">
                            {leader.name}
                          </span>
                          {leader.isMe ? <Badge tone="primary">You</Badge> : null}
                          {leader.badge ? <Badge tone="success">{leader.badge}</Badge> : null}
                        </div>
                        <p className="truncate text-xs text-muted">{leader.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-fg">
                        <Award className="h-3.5 w-3.5 text-primary-500" aria-hidden="true" />
                        {leader.helpedCount} helped
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        {leader.acceptedCount} accepted
                      </span>
                    </div>
                  </div>
                );
              })}
            </GlassCard>
          )}
        </>
      )}
    </CommunityLayout>
  );
}
