import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  MessageSquarePlus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { useExperience } from '../../app/experience';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  Input,
  Skeleton,
  Textarea,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createCommunityPost,
  fetchCommunityDashboard,
  fetchCommunityFeed,
  fetchCommunityHome,
  joinGroupByInviteCode,
  toggleBookmarkPost,
  toggleCommunityVote,
  updateCommunityProfile,
} from './communityApi';
import { CommunityLayout } from './CommunityLayout';
import { CommunityRulesModal } from './CommunityRulesModal';
import { FeedPostCard } from './FeedPostCard';

type FeedFilter = 'all' | 'following' | 'unanswered' | 'trending' | 'resources' | 'bookmarks';

export function CommunityHomePage() {
  const path = useAppPath();
  const exp = useExperience();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();

  const [rulesOpen, setRulesOpen] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Post Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [postCommunityId, setPostCommunityId] = useState('');
  const [postType, setPostType] = useState<'question' | 'discussion' | 'resource'>('question');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postTag, setPostTag] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);

  // Support deep link ?join=CODE for group invites
  useEffect(() => {
    const code = searchParams.get('join')?.trim();
    if (!code) return;
    void joinGroupByInviteCode(code)
      .then((res) => {
        toast.show({ kind: 'success', title: `Joined ${res.name}` });
        setSearchParams({});
        void qc.invalidateQueries({ queryKey: ['community'] });
        navigate(path(`/community/groups/${res.groupId}`), { replace: true });
      })
      .catch((err) => {
        toast.show({
          kind: 'error',
          title: 'Could not join group',
          description: err instanceof ApiError ? err.message : 'Invalid invite link.',
        });
        setSearchParams({});
      });
  }, [searchParams, setSearchParams, navigate, path, qc, toast]);

  const homeQuery = useQuery({
    queryKey: ['community', 'home'],
    queryFn: fetchCommunityHome,
    staleTime: 20_000,
  });

  const dashboardQuery = useQuery({
    queryKey: ['community', 'dashboard'],
    queryFn: fetchCommunityDashboard,
    staleTime: 20_000,
  });

  const feedQuery = useQuery({
    queryKey: ['community', 'feed', filter, searchQuery],
    queryFn: () =>
      fetchCommunityFeed({
        filter,
        q: searchQuery.trim() || undefined,
      }),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!postCommunityId && homeQuery.data?.communities?.[0]?.id) {
      setPostCommunityId(homeQuery.data.communities[0].id);
    }
  }, [homeQuery.data, postCommunityId]);

  if (homeQuery.isLoading || dashboardQuery.isLoading) {
    return (
      <CommunityLayout>
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </CommunityLayout>
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
        onRetry={() => {
          void homeQuery.refetch();
          void dashboardQuery.refetch();
        }}
      />
    );
  }

  const home = homeQuery.data;
  const dash = dashboardQuery.data;
  const joinedCommunities = home.communities;

  const handleVote = async (postId: string) => {
    try {
      await toggleCommunityVote('post', postId);
      await qc.invalidateQueries({ queryKey: ['community', 'feed'] });
      await qc.invalidateQueries({ queryKey: ['community', 'dashboard'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update vote',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleBookmark = async (postId: string) => {
    try {
      const res = await toggleBookmarkPost(postId);
      await qc.invalidateQueries({ queryKey: ['community', 'feed'] });
      toast.show({
        kind: 'success',
        title: res.bookmarked ? 'Saved to Bookmarks' : 'Removed from Bookmarks',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update bookmark',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCommunityId) {
      toast.show({
        kind: 'info',
        title: `Select a ${exp.labels.courseLower}`,
        description: `Join or add a ${exp.labels.courseLower} first before posting.`,
      });
      return;
    }
    setSubmittingPost(true);
    try {
      await createCommunityPost(postCommunityId, {
        type: postType,
        title: postTitle.trim(),
        body: postBody.trim(),
        topicTag: postTag.trim() || null,
      });
      setPostTitle('');
      setPostBody('');
      setPostTag('');
      setComposerOpen(false);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: 'Published to Study Community!' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not publish post',
        description: err instanceof ApiError ? err.message : 'Check your input and try again.',
      });
    } finally {
      setSubmittingPost(false);
    }
  };

  const handlePrivacyToggle = async (field: 'hideStats' | 'showInClassmates', value: boolean) => {
    try {
      await updateCommunityProfile({ [field]: value });
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: 'Community privacy updated' });
    } catch {
      toast.show({ kind: 'error', title: 'Could not update preference' });
    }
  };

  const feedPosts = feedQuery.data?.items ?? [];

  return (
    <CommunityLayout dashboardOverride={dash}>
      {/* Welcome Banner */}
      <GlassCard className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">
                {exp.isShs ? 'SHS Community' : 'University Study Community'}
              </Badge>
              {home.profile.badge && !home.profile.hideStats ? (
                <Badge tone="success" className="inline-flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" aria-hidden="true" />
                  {home.profile.badge} · Helped {home.profile.helpedCount}
                </Badge>
              ) : null}
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Welcome back
              {dash?.userSummary?.name ? `, ${dash.userSummary.name.split(' ')[0]}` : ''}!
            </h1>
            <p className="text-sm text-muted">
              {exp.isShs
                ? `Collaborate on SHS subjects, ask WASSCE questions, and join peer study groups.`
                : `Connect with classmates across your courses, ask questions, and share study resources.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setComposerOpen((v) => !v)}>
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              New Post
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setRulesOpen(true)}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Rules
            </Button>
          </div>
        </div>

        {/* Privacy quick controls */}
        <div className="flex flex-wrap items-center gap-4 border-t border-line/60 pt-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={home.profile.showInClassmates}
              onChange={(e) => void handlePrivacyToggle('showInClassmates', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Show me in classmates
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={home.profile.hideStats}
              onChange={(e) => void handlePrivacyToggle('hideStats', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Hide helper stats
          </label>
        </div>
      </GlassCard>

      {/* Rules / Exam Notices */}
      {!home.rulesAccepted ? (
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

      {home.examNotice.enabled && home.examNotice.message ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{home.examNotice.message}</span>
        </div>
      ) : null}

      {/* Community Statistics Strip */}
      {dash?.stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <GlassCard className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Active Students</span>
              <Users className="h-3.5 w-3.5 text-primary-500" aria-hidden="true" />
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">
              {dash.stats.totalStudents}
            </p>
          </GlassCard>
          <GlassCard className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Discussions</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">{dash.stats.totalPosts}</p>
          </GlassCard>
          <GlassCard className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Solved Q&amp;As</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">
              {dash.stats.solvedDiscussions}
            </p>
          </GlassCard>
          <GlassCard className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Resources Shared</span>
              <FolderOpen className="h-3.5 w-3.5 text-primary-500" aria-hidden="true" />
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">
              {dash.stats.totalResources}
            </p>
          </GlassCard>
        </div>
      ) : null}

      {/* Inline Post Composer */}
      {composerOpen ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-fg">
              Start a Study Discussion or Question
            </h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setComposerOpen(false)}>
              Close
            </Button>
          </div>
          {joinedCommunities.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={`No ${exp.labels.coursePluralLower} joined yet`}
              description={`Add your ${exp.labels.coursePluralLower} or join one in Discover before posting.`}
              action={
                <Link to={path('/community/discover')}>
                  <Button size="sm">Explore {exp.labels.coursePlural}</Button>
                </Link>
              }
            />
          ) : (
            <form onSubmit={handleCreatePost} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="home-post-community"
                    className="mb-1 block text-xs font-medium text-muted"
                  >
                    {exp.labels.courseSingular}
                  </label>
                  <select
                    id="home-post-community"
                    value={postCommunityId}
                    onChange={(e) => setPostCommunityId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
                  >
                    {joinedCommunities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="home-post-type"
                    className="mb-1 block text-xs font-medium text-muted"
                  >
                    Post type
                  </label>
                  <select
                    id="home-post-type"
                    value={postType}
                    onChange={(e) =>
                      setPostType(e.target.value as 'question' | 'discussion' | 'resource')
                    }
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
                  >
                    <option value="question">Question</option>
                    <option value="discussion">Discussion</option>
                    <option value="resource">Study Tip / Resource</option>
                  </select>
                </div>
                <Input
                  label="Topic tag (optional)"
                  value={postTag}
                  onChange={(e) => setPostTag(e.target.value)}
                  placeholder="e.g. Algebra, Essay"
                />
              </div>
              <Input
                label="Title"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="Ask a clear academic question or share a topic..."
                required
              />
              <Textarea
                label="Details"
                rows={3}
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Explain what you've tried so far or share your notes..."
                required
              />
              <div className="flex justify-end gap-2">
                <Button type="submit" size="sm" loading={submittingPost}>
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Publish Post
                </Button>
              </div>
            </form>
          )}
        </Card>
      ) : null}

      {/* Central Community Feed Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All Feed' },
              { id: 'following', label: 'Following' },
              { id: 'unanswered', label: 'Unanswered' },
              { id: 'trending', label: 'Trending' },
              { id: 'resources', label: 'Resources' },
              { id: 'bookmarks', label: 'Saved' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'border border-line bg-surface text-muted hover:bg-surface2 hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search discussions..."
            aria-label="Search community feed"
            className="h-9 w-full rounded-xl border border-line bg-surface pl-8 pr-3 text-xs text-fg placeholder:text-muted focus:border-primary-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Central Community Feed Stream */}
      {feedQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : feedPosts.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={BookOpen}
            title={
              filter === 'following'
                ? 'No posts from students you follow yet'
                : filter === 'bookmarks'
                  ? 'No saved discussions yet'
                  : 'No discussions match right now'
            }
            description={
              filter === 'following'
                ? 'Follow classmates in Discover or Suggested Students to customize this feed.'
                : `Start the conversation in one of your ${exp.labels.coursePluralLower}!`
            }
            action={
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Create First Post
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {feedPosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onVote={(id) => void handleVote(id)}
              onBookmark={(id) => void handleBookmark(id)}
            />
          ))}
        </div>
      )}

      <CommunityRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onAccepted={() => {
          setRulesOpen(false);
          void qc.invalidateQueries({ queryKey: ['community'] });
        }}
      />
    </CommunityLayout>
  );
}
