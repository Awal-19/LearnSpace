import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BookOpen,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  Input,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchCommunityHome, joinGroupByInviteCode, updateCommunityProfile } from './communityApi';
import { CommunityRulesModal } from './CommunityRulesModal';

export function CommunityHomePage() {
  const path = useAppPath();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();

  const [rulesOpen, setRulesOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  useEffect(() => {
    const code = searchParams.get('join')?.trim();
    if (!code) return;
    setInviteCode(code);
    setJoiningCode(true);
    void joinGroupByInviteCode(code)
      .then((res) => {
        toast.show({ kind: 'success', title: `Joined ${res.name}` });
        setSearchParams({});
        void qc.invalidateQueries({ queryKey: ['community', 'home'] });
        navigate(path(`/community/groups/${res.groupId}`), { replace: true });
      })
      .catch((err) => {
        toast.show({
          kind: 'error',
          title: 'Could not join group',
          description: err instanceof ApiError ? err.message : 'Invalid invite link.',
        });
        setSearchParams({});
      })
      .finally(() => setJoiningCode(false));
  }, [searchParams, setSearchParams, navigate, path, qc, toast]);

  const homeQuery = useQuery({
    queryKey: ['community', 'home'],
    queryFn: fetchCommunityHome,
    staleTime: 20_000,
  });

  if (homeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (homeQuery.isError || !homeQuery.data) {
    return (
      <ErrorState
        title="Could not load Community"
        message={
          homeQuery.error instanceof ApiError
            ? homeQuery.error.message
            : 'Please check your connection and try again.'
        }
        onRetry={() => void homeQuery.refetch()}
      />
    );
  }

  const data = homeQuery.data;

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      toast.show({
        kind: 'info',
        title: 'Enter an invite code',
        description:
          'Paste a group invite code, or click a Course Community below to join a public group.',
      });
      return;
    }
    setJoiningCode(true);
    try {
      const res = await joinGroupByInviteCode(inviteCode.trim());
      toast.show({ kind: 'success', title: `Joined ${res.name}` });
      setInviteCode('');
      await qc.invalidateQueries({ queryKey: ['community', 'home'] });
      navigate(path(`/community/groups/${res.groupId}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Invalid invite code',
        description: err instanceof ApiError ? err.message : 'Check the code and try again.',
      });
    } finally {
      setJoiningCode(false);
    }
  };

  const handlePrivacyToggle = async (field: 'hideStats' | 'showInClassmates', value: boolean) => {
    try {
      await updateCommunityProfile({ [field]: value });
      await qc.invalidateQueries({ queryKey: ['community', 'home'] });
      toast.show({ kind: 'success', title: 'Community privacy updated' });
    } catch {
      toast.show({ kind: 'error', title: 'Could not update preference' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                Course Community
              </h1>
              {data.profile.badge && !data.profile.hideStats ? (
                <Badge tone="success" className="inline-flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" aria-hidden="true" />
                  {data.profile.badge} · Helped {data.profile.helpedCount}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              Ask questions, share study resources, and learn together with classmates in your
              courses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={data.profile.showInClassmates}
                onChange={(e) => void handlePrivacyToggle('showInClassmates', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line"
              />
              Show me in classmates
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={data.profile.hideStats}
                onChange={(e) => void handlePrivacyToggle('hideStats', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line"
              />
              Hide helper stats
            </label>
            <Button type="button" size="sm" variant="secondary" onClick={() => setRulesOpen(true)}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Rules
            </Button>
          </div>
        </div>
      </GlassCard>

      {!data.rulesAccepted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-400/50 bg-primary-500/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-primary-500" aria-hidden="true" />
            <span>
              Accept the short Community Rules before posting questions or chatting in groups.
            </span>
          </div>
          <Button type="button" size="sm" onClick={() => setRulesOpen(true)}>
            Review &amp; Accept Rules
          </Button>
        </div>
      ) : null}

      {data.examNotice.enabled && data.examNotice.message ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{data.examNotice.message}</span>
        </div>
      ) : null}

      {/* My Course Communities */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-fg">My Course Communities</h2>
          <Link
            to={path('/courses')}
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            Manage courses
          </Link>
        </div>

        {data.communities.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={BookOpen}
              title="No course communities yet"
              description="Add a course on the Courses page and LearnSpace will automatically connect you to its course community."
              action={
                <Link to={path('/courses')}>
                  <Button size="sm">Go to Courses</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.communities.map((comm) => (
              <Link key={comm.id} to={path(`/community/courses/${comm.id}`)}>
                <Card className="h-full space-y-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-fg">
                        {comm.displayName}
                      </h3>
                      <p className="text-xs text-muted">
                        {comm.universityName ?? 'Global course community'}
                      </p>
                    </div>
                    {comm.isPaused ? <Badge tone="warning">Exam pause</Badge> : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      {comm.memberCount} members
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {comm.postCount} posts
                    </span>
                    <span>{comm.groupCount} groups</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* My Study Groups & Join by Code */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-fg">My Study Groups</h2>
          <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
            <Input
              label="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code..."
              aria-label="Study group invite code"
              className="h-8 w-44 text-xs"
            />
            <Button type="submit" size="sm" variant="secondary" loading={joiningCode}>
              Join group
            </Button>
          </form>
        </div>

        {data.myGroups.length === 0 ? (
          <Card className="p-5 text-xs text-muted">
            You haven&apos;t joined any study groups yet. Open any course community above to create
            or join a study group.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.myGroups.map((g) => (
              <Link key={g.id} to={path(`/community/groups/${g.id}`)}>
                <Card className="h-full space-y-2 p-4 transition-all hover:border-primary-300">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-fg">{g.name}</h3>
                    <Badge tone="neutral">{g.role}</Badge>
                  </div>
                  <p className="text-xs text-muted">{g.communityName}</p>
                  <p className="text-xs text-muted">
                    {g.memberCount} members · {g.messageCount} messages
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Unanswered & Trending */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-fg">
              Unanswered Questions You Can Help With
            </h2>
          </div>
          {data.unanswered.length === 0 ? (
            <p className="text-xs text-muted">No unanswered questions in your courses right now.</p>
          ) : (
            <div className="divide-y divide-line/60">
              {data.unanswered.map((p) => (
                <Link
                  key={p.id}
                  to={path(`/community/courses/${p.communityId}?post=${p.id}`)}
                  className="block py-2.5 text-sm transition-colors hover:text-primary-600"
                >
                  <p className="font-medium text-fg">{p.title}</p>
                  <p className="text-xs text-muted">
                    {p.communityName} · {p.author.name} · {p.replyCount} replies
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-500" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-fg">
              Trending in Your Courses
            </h2>
          </div>
          {data.trending.length === 0 ? (
            <p className="text-xs text-muted">
              No posts yet. Start a discussion in one of your courses!
            </p>
          ) : (
            <div className="divide-y divide-line/60">
              {data.trending.map((p) => (
                <Link
                  key={p.id}
                  to={path(`/community/courses/${p.communityId}?post=${p.id}`)}
                  className="block py-2.5 text-sm transition-colors hover:text-primary-600"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-fg">{p.title}</p>
                    <Badge tone={p.status === 'resolved' ? 'success' : 'neutral'}>{p.status}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {p.communityName} · {p.helpfulCount} helpful · {p.replyCount} replies
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <CommunityRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onAccepted={() => {
          setRulesOpen(false);
          void qc.invalidateQueries({ queryKey: ['community', 'home'] });
        }}
      />
    </div>
  );
}
