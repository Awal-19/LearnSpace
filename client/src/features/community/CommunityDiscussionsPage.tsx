import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, MessageSquarePlus, Search, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { useExperience } from '../../app/experience';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createCommunityPost,
  fetchCommunityDashboard,
  fetchCommunityFeed,
  toggleBookmarkPost,
  toggleCommunityVote,
} from './communityApi';
import { CommunityLayout } from './CommunityLayout';
import { FeedPostCard } from './FeedPostCard';

type FeedFilter = 'all' | 'unanswered' | 'trending' | 'following' | 'resources' | 'bookmarks';
type PostTypeFilter = 'all' | 'question' | 'discussion' | 'resource' | 'announcement';

export function CommunityDiscussionsPage() {
  const path = useAppPath();
  const exp = useExperience();
  const toast = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const [filter, setFilter] = useState<FeedFilter>('all');
  const [postType, setPostType] = useState<PostTypeFilter>('all');
  const [communityId, setCommunityId] = useState('');
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  const [composerOpen, setComposerOpen] = useState(false);
  const [newCommunityId, setNewCommunityId] = useState('');
  const [newType, setNewType] = useState<'question' | 'discussion' | 'resource'>('question');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dashQuery = useQuery({
    queryKey: ['community', 'dashboard'],
    queryFn: fetchCommunityDashboard,
    staleTime: 20_000,
  });

  const feedQuery = useQuery({
    queryKey: ['community', 'discussions', filter, postType, communityId, search],
    queryFn: () =>
      fetchCommunityFeed({
        filter,
        type: postType,
        communityId: communityId || undefined,
        q: search.trim() || undefined,
        limit: 25,
      }),
    staleTime: 15_000,
  });

  const joinedCommunities = (dashQuery.data?.popularSubjects ?? []).filter((c) => c.isJoined);

  useEffect(() => {
    if (!newCommunityId && joinedCommunities[0]?.id) {
      setNewCommunityId(joinedCommunities[0].id);
    }
  }, [joinedCommunities, newCommunityId]);

  const handleVote = async (postId: string) => {
    try {
      await toggleCommunityVote('post', postId);
      await qc.invalidateQueries({ queryKey: ['community'] });
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
      await qc.invalidateQueries({ queryKey: ['community'] });
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
    if (!newCommunityId) return;
    setSubmitting(true);
    try {
      await createCommunityPost(newCommunityId, {
        type: newType,
        title: newTitle.trim(),
        body: newBody.trim(),
        topicTag: newTag.trim() || null,
      });
      setComposerOpen(false);
      setNewTitle('');
      setNewBody('');
      setNewTag('');
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: 'Discussion posted!' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not post discussion',
        description: err instanceof ApiError ? err.message : 'Check your input and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CommunityLayout dashboardOverride={dashQuery.data}>
      <GlassCard className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary-500" aria-hidden="true" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                Discussions &amp; Q&amp;A
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Ask tough questions, help classmates solve problems, and save great explanations.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setComposerOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            Ask or Discuss
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unanswered', label: 'Unanswered' },
                { id: 'trending', label: 'Trending' },
                { id: 'following', label: 'Following' },
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

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by post type"
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostTypeFilter)}
              className="h-9 rounded-xl border border-line bg-surface px-2.5 text-xs text-fg"
            >
              <option value="all">All types</option>
              <option value="question">Questions</option>
              <option value="discussion">Discussions</option>
              <option value="resource">Resources</option>
            </select>

            {(dashQuery.data?.popularSubjects ?? []).length > 0 ? (
              <select
                aria-label={`Filter by ${exp.labels.courseLower}`}
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
                className="h-9 max-w-[170px] rounded-xl border border-line bg-surface px-2.5 text-xs text-fg"
              >
                <option value="">All {exp.labels.coursePlural}</option>
                {dashQuery.data!.popularSubjects.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="relative w-44">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search discussions"
                className="h-9 w-full rounded-xl border border-line bg-surface pl-8 pr-2.5 text-xs text-fg placeholder:text-muted focus:border-primary-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {feedQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : feedQuery.isError ? (
        <ErrorState
          title="Could not load Discussions"
          message={
            feedQuery.error instanceof ApiError
              ? feedQuery.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void feedQuery.refetch()}
        />
      ) : (feedQuery.data?.items ?? []).length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={MessageSquare}
            title="No discussions found"
            description="Try clearing your filters or start a new discussion."
            action={
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Start Discussion
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {feedQuery.data!.items.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onVote={(id) => void handleVote(id)}
              onBookmark={(id) => void handleBookmark(id)}
            />
          ))}
        </div>
      )}

      <Modal open={composerOpen} onClose={() => setComposerOpen(false)} title="New Discussion">
        {joinedCommunities.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={`Join a ${exp.labels.courseLower} first`}
            description={`Join a ${exp.labels.courseLower} in Discover before posting a discussion.`}
            action={
              <Link to={path('/community/discover')}>
                <Button size="sm">Go to Discover</Button>
              </Link>
            }
          />
        ) : (
          <form onSubmit={handleCreatePost} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="disc-community"
                  className="mb-1 block text-xs font-medium text-muted"
                >
                  {exp.labels.courseSingular}
                </label>
                <select
                  id="disc-community"
                  value={newCommunityId}
                  onChange={(e) => setNewCommunityId(e.target.value)}
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
                  htmlFor="disc-post-type"
                  className="mb-1 block text-xs font-medium text-muted"
                >
                  Type
                </label>
                <select
                  id="disc-post-type"
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as 'question' | 'discussion' | 'resource')
                  }
                  className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
                >
                  <option value="question">Question</option>
                  <option value="discussion">Discussion</option>
                  <option value="resource">Study Resource</option>
                </select>
              </div>
            </div>

            <Input
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Write a clear question or topic title..."
              required
            />
            <Input
              label="Topic tag (optional)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="e.g. Organic Chemistry"
            />
            <Textarea
              label="Details"
              rows={4}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Add steps you tried or context for classmates..."
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setComposerOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={submitting}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Post
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </CommunityLayout>
  );
}
