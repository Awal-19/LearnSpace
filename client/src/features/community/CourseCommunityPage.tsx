import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  CheckCircle2,
  EyeOff,
  Flag,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Search,
  Share2,
  ShieldBan,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';
import {
  acceptCommunityReply,
  askAwalFirst,
  communityAttachmentUrl,
  createCommunityPost,
  createCommunityReply,
  createStudyGroup,
  deleteCommunityPost,
  fetchCommunityDetail,
  fetchCommunityGroups,
  fetchCommunityHome,
  fetchCommunityPosts,
  fetchPostDetail,
  fetchSharedResources,
  joinStudyGroup,
  leaveCommunity,
  moderateInCommunity,
  saveSharedResourceToCourse,
  shareCommunityResource,
  toggleCommunityVote,
  uploadCommunityAttachment,
} from './communityApi';
import { CommunityRulesModal } from './CommunityRulesModal';
import { BlockUserModal, ReportModal } from './ReportAndBlockModal';

type Tab = 'feed' | 'groups' | 'resources' | 'classmates';
type FeedFilter = 'all' | 'unanswered' | 'my_questions' | 'my_answers' | 'resources';

export function CourseCommunityPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const path = useAppPath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('feed');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  // Ask/Post modal
  const [askOpen, setAskOpen] = useState(false);
  const [postType, setPostType] = useState<'question' | 'discussion' | 'resource' | 'announcement'>(
    'question',
  );
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postTopic, setPostTopic] = useState('');
  const [postAnon, setPostAnon] = useState(false);
  const [awalAnswer, setAwalAnswer] = useState<string | null>(null);
  const [awalLoading, setAwalLoading] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [submittingPost, setSubmittingPost] = useState(false);

  // Post Detail modal
  const selectedPostId = searchParams.get('post');
  const [replyBody, setReplyBody] = useState('');
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyAnon, setReplyAnon] = useState(false);
  const [replyAiFlag, setReplyAiFlag] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Group create modal
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupVis, setGroupVis] = useState<'public_course' | 'invite_only'>('public_course');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  // Share resource modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareType, setShareType] = useState<'link' | 'note_copy' | 'document' | 'recommendation'>(
    'link',
  );
  const [shareTitle, setShareTitle] = useState('');
  const [shareDesc, setShareDesc] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareRightConfirmed, setShareRightConfirmed] = useState(false);
  const [sharingResource, setSharingResource] = useState(false);

  // Report & Block modals
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'reply' | 'message' | 'resource' | 'user';
    id: string;
    label?: string;
  } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null);

  const homeQuery = useQuery({ queryKey: ['community', 'home'], queryFn: fetchCommunityHome });
  const detailQuery = useQuery({
    queryKey: ['community', 'detail', communityId],
    queryFn: () => fetchCommunityDetail(communityId!),
    enabled: Boolean(communityId),
  });
  const postsQuery = useQuery({
    queryKey: ['community', 'posts', communityId, filter, search],
    queryFn: () => fetchCommunityPosts(communityId!, { filter, q: search.trim() || undefined }),
    enabled: Boolean(communityId),
  });
  const groupsQuery = useQuery({
    queryKey: ['community', 'groups', communityId],
    queryFn: () => fetchCommunityGroups(communityId!),
    enabled: Boolean(communityId) && tab === 'groups',
  });
  const resourcesQuery = useQuery({
    queryKey: ['community', 'resources', communityId],
    queryFn: () => fetchSharedResources(communityId!),
    enabled: Boolean(communityId) && tab === 'resources',
  });
  const postDetailQuery = useQuery({
    queryKey: ['community', 'post', selectedPostId],
    queryFn: () => fetchPostDetail(selectedPostId!),
    enabled: Boolean(selectedPostId),
  });

  useEffect(() => {
    setReplyBody('');
    setReplyParentId(null);
    setReplyAiFlag(false);
  }, [selectedPostId]);

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Could not load course community"
        message={
          detailQuery.error instanceof ApiError ? detailQuery.error.message : 'Community not found.'
        }
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const comm = detailQuery.data;
  const rulesAccepted = homeQuery.data?.rulesAccepted ?? true;
  const isMod = comm.myRole === 'moderator' || comm.myRole === 'course_rep';

  const requireRulesOrOpen = () => {
    if (!rulesAccepted) {
      setRulesOpen(true);
      return false;
    }
    return true;
  };

  const handleAskAwalFirst = async () => {
    if (!postTitle.trim() || !postBody.trim()) {
      toast.show({ kind: 'error', title: 'Enter a title and details first' });
      return;
    }
    setAwalLoading(true);
    try {
      const res = await askAwalFirst({ title: postTitle, body: postBody, mode: 'ask_first' });
      setAwalAnswer(res.answer);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'AWAL unavailable',
        description:
          err instanceof ApiError ? err.message : 'Try posting to your course community.',
      });
    } finally {
      setAwalLoading(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireRulesOrOpen()) return;
    setSubmittingPost(true);
    try {
      const res = await createCommunityPost(comm.id, {
        type: postType,
        title: postTitle,
        body: postBody,
        topicTag: postTopic.trim() || null,
        isAnonymous: postAnon,
        aiAttempt: awalAnswer,
        attachmentIds,
      });
      setAskOpen(false);
      setPostTitle('');
      setPostBody('');
      setPostTopic('');
      setAwalAnswer(null);
      setAttachmentIds([]);
      await qc.invalidateQueries({ queryKey: ['community', 'posts', communityId] });
      toast.show({
        kind: 'success',
        title: res.flaggedByFilter ? 'Posted (flagged for review)' : 'Posted to course community',
      });
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

  const handleUploadFile = async (file: File) => {
    try {
      const att = await uploadCommunityAttachment(file);
      setAttachmentIds((prev) => [...prev, att.id]);
      toast.show({ kind: 'success', title: `Attached ${att.originalName}` });
    } catch {
      toast.show({ kind: 'error', title: 'Could not upload file' });
    }
  };

  const handleCreateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostId || !requireRulesOrOpen()) return;
    setSubmittingReply(true);
    try {
      await createCommunityReply(selectedPostId, {
        body: replyBody,
        parentReplyId: replyParentId,
        isAnonymous: replyAnon,
        isAiGenerated: replyAiFlag,
      });
      setReplyBody('');
      setReplyParentId(null);
      setReplyAiFlag(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['community', 'post', selectedPostId] }),
        qc.invalidateQueries({ queryKey: ['community', 'posts', communityId] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Reply failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDraftWithAwal = async () => {
    const p = postDetailQuery.data?.post;
    if (!p) return;
    setAwalLoading(true);
    try {
      const res = await askAwalFirst({
        title: p.title,
        body: p.body ?? '',
        mode: 'draft_helper',
      });
      setReplyBody(res.answer);
      setReplyAiFlag(true);
      toast.show({ kind: 'info', title: 'Draft inserted. Review and edit before posting.' });
    } catch {
      toast.show({ kind: 'error', title: 'Could not generate draft' });
    } finally {
      setAwalLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireRulesOrOpen()) return;
    setCreatingGroup(true);
    try {
      const g = await createStudyGroup({
        communityId: comm.id,
        name: groupName,
        description: groupDesc.trim() || null,
        visibility: groupVis,
      });
      setGroupOpen(false);
      setGroupName('');
      setGroupDesc('');
      toast.show({ kind: 'success', title: 'Study group created!' });
      navigate(path(`/community/groups/${g.id}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create group',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleShareResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireRulesOrOpen() || !shareRightConfirmed) return;
    setSharingResource(true);
    try {
      await shareCommunityResource({
        communityId: comm.id,
        sourceType: shareType,
        title: shareTitle,
        description: shareDesc.trim() || null,
        url: shareUrl.trim() || null,
        rightConfirmed: true,
      });
      setShareOpen(false);
      setShareTitle('');
      setShareDesc('');
      setShareUrl('');
      setShareRightConfirmed(false);
      await qc.invalidateQueries({ queryKey: ['community', 'resources', communityId] });
      toast.show({ kind: 'success', title: 'Resource shared with course community' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not share resource',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSharingResource(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(path('/community'))}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Community
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await leaveCommunity(comm.id);
            toast.show({ kind: 'success', title: `Left ${comm.displayName}` });
            navigate(path('/community'));
          }}
        >
          Leave community
        </Button>
      </div>

      {/* Header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-fg">{comm.displayName}</h1>
              <Badge tone="neutral">{comm.universityName ?? 'Global'}</Badge>
              {isMod ? <Badge tone="primary">{comm.myRole}</Badge> : null}
              {comm.isPaused ? <Badge tone="warning">Questions paused (Exam period)</Badge> : null}
            </div>
            <p className="text-xs text-muted">
              {comm.memberCount} members · {comm.postCount} posts · {comm.groupCount} study groups
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={comm.isPaused}
              onClick={() => {
                if (requireRulesOrOpen()) setAskOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ask a question
            </Button>
          </div>
        </div>
      </Card>

      {comm.examNotice.enabled && comm.examNotice.message ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{comm.examNotice.message}</span>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60">
        {(
          [
            { id: 'feed', label: 'Q&A Feed' },
            { id: 'groups', label: 'Study Groups' },
            { id: 'resources', label: 'Shared Resources' },
            { id: 'classmates', label: `Classmates (${comm.classmates.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Q&A Feed Tab */}
      {tab === 'feed' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'All'],
                  ['unanswered', 'Unanswered'],
                  ['my_questions', 'My questions'],
                  ['my_answers', 'My answers'],
                  ['resources', 'Resources'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === id
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface2 text-muted hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
                className="h-8 w-full rounded-xl border border-line bg-surface2/50 pl-8 pr-3 text-xs text-fg focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>

          {postsQuery.isLoading ? (
            <Skeleton className="h-44 rounded-2xl" />
          ) : (postsQuery.data?.items.length ?? 0) === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={HelpCircle}
                title="No questions yet. Be the first to ask"
                description="Ask a question, start a discussion, or share a study tip with classmates."
                action={
                  <Button size="sm" onClick={() => setAskOpen(true)}>
                    Ask a question
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {postsQuery.data!.items.map((p) => (
                <Card
                  key={p.id}
                  className="cursor-pointer space-y-2 p-4 transition-all hover:border-primary-300"
                  onClick={() => setSearchParams({ post: p.id })}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.isPinned ? (
                        <Badge tone="primary" className="inline-flex items-center gap-1">
                          <Pin className="h-3 w-3" aria-hidden="true" />
                          Pinned
                        </Badge>
                      ) : null}
                      <Badge tone="neutral">{p.type}</Badge>
                      <Badge
                        tone={
                          p.status === 'resolved'
                            ? 'success'
                            : p.status === 'answered'
                              ? 'primary'
                              : 'warning'
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.topicTag ? <Badge tone="neutral">#{p.topicTag}</Badge> : null}
                    </div>
                    <span className="text-xs text-muted">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-fg">{p.title}</h3>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {p.author.name}
                      {p.author.badge ? ` · ${p.author.badge}` : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                        {p.helpfulCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        {p.replyCount}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Study Groups Tab */}
      {tab === 'groups' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (requireRulesOrOpen()) setGroupOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create study group
            </Button>
          </div>
          {groupsQuery.isLoading ? (
            <Skeleton className="h-36 rounded-2xl" />
          ) : (groupsQuery.data?.length ?? 0) === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={Users}
                title="No study groups in this course yet"
                description="Create a study group to chat in real time, share notes, and study together."
                action={
                  <Button size="sm" onClick={() => setGroupOpen(true)}>
                    Create first group
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {groupsQuery.data!.map((g) => (
                <Card key={g.id} className="flex flex-col justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-fg">{g.name}</h3>
                      <Badge tone="neutral">
                        {g.visibility === 'invite_only' ? 'Invite only' : 'Course public'}
                      </Badge>
                    </div>
                    {g.description ? <p className="text-xs text-muted">{g.description}</p> : null}
                    <p className="text-xs text-muted">
                      {g.memberCount} members · {g.messageCount} messages
                    </p>
                  </div>
                  <div>
                    {g.isMember ? (
                      <Link to={path(`/community/groups/${g.id}`)}>
                        <Button size="sm" className="w-full">
                          Open group chat
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        loading={joiningGroupId === g.id}
                        onClick={async () => {
                          setJoiningGroupId(g.id);
                          try {
                            await joinStudyGroup(g.id);
                            await qc.invalidateQueries({ queryKey: ['community'] });
                            navigate(path(`/community/groups/${g.id}`));
                          } catch (err) {
                            toast.show({
                              kind: 'error',
                              title: 'Could not join group',
                              description:
                                err instanceof ApiError ? err.message : 'Please try again.',
                            });
                          } finally {
                            setJoiningGroupId(null);
                          }
                        }}
                      >
                        Join group
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Shared Resources Tab */}
      {tab === 'resources' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (requireRulesOrOpen()) setShareOpen(true);
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share resource
            </Button>
          </div>
          {resourcesQuery.isLoading ? (
            <Skeleton className="h-36 rounded-2xl" />
          ) : (resourcesQuery.data?.items.length ?? 0) === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={Share2}
                title="No shared resources yet"
                description="Share a helpful study link or read-only note copy with your classmates."
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {resourcesQuery.data!.items.map((r) => (
                <Card key={r.id} className="flex flex-col justify-between gap-3 p-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="neutral">{r.sourceType.replace('_', ' ')}</Badge>
                      <span className="text-xs text-muted">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-semibold text-fg">{r.title}</h3>
                    {r.description ? <p className="text-xs text-muted">{r.description}</p> : null}
                    <p className="text-xs text-muted">Shared by {r.author.name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
                      >
                        Open
                      </a>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await saveSharedResourceToCourse(r.id);
                        toast.show({ kind: 'success', title: 'Saved to your course!' });
                      }}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      Save to my course
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await toggleCommunityVote('resource', r.id);
                        void resourcesQuery.refetch();
                      }}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                      {r.helpfulCount}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setReportTarget({ type: 'resource', id: r.id, label: r.title })
                      }
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Classmates Tab */}
      {tab === 'classmates' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {comm.classmates.map((c) => (
            <Card key={c.id ?? c.name} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-fg">{c.name}</p>
                <p className="text-xs text-muted">
                  {c.role}
                  {c.badge ? ` · ${c.badge}` : ''}
                </p>
              </div>
              {c.id ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBlockTarget({ id: c.id!, name: c.name })}
                    title="Block user"
                  >
                    <ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReportTarget({ type: 'user', id: c.id!, label: c.name })}
                    title="Report user"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {/* Ask a Question / New Post Modal */}
      <Modal open={askOpen} onClose={() => setAskOpen(false)} title="Ask your course community">
        <form onSubmit={handleCreatePost} className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {(
              ['question', 'discussion', 'resource', ...(isMod ? ['announcement'] : [])] as const
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPostType(t as typeof postType)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${
                  postType === t ? 'bg-primary-600 text-white' : 'bg-surface2 text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Input
            label="Title"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
            placeholder="e.g. Why does Dijkstra fail with negative edge weights?"
            required
          />
          <Textarea
            label="Details (Markdown & $math$ supported)"
            rows={4}
            value={postBody}
            onChange={(e) => setPostBody(e.target.value)}
            placeholder="Explain where you got stuck..."
            required
          />
          <Input
            label="Topic tag (optional)"
            value={postTopic}
            onChange={(e) => setPostTopic(e.target.value)}
            placeholder="e.g. Graph Algorithms"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary-600">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              Attach image/file
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadFile(f);
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={postAnon}
                onChange={(e) => setPostAnon(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line"
              />
              Post anonymously to students
            </label>
          </div>
          {attachmentIds.length > 0 ? (
            <p className="text-xs text-emerald-600">{attachmentIds.length} attachment(s) ready</p>
          ) : null}

          <div className="rounded-xl border border-primary-300/60 bg-primary-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg">Need an instant explanation?</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={awalLoading}
                onClick={() => void handleAskAwalFirst()}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Ask AWAL first
              </Button>
            </div>
            {awalAnswer ? (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg bg-surface p-2.5 text-xs">
                <p className="mb-1 font-semibold text-primary-600">
                  AWAL&apos;s instant answer (AI):
                </p>
                <MarkdownContent content={awalAnswer} />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={submittingPost}>
              {awalAnswer ? 'Post to my course community' : 'Publish post'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Post Detail Modal */}
      <Modal
        open={Boolean(selectedPostId)}
        onClose={() => setSearchParams({})}
        title={postDetailQuery.data?.post.title ?? 'Discussion'}
      >
        {postDetailQuery.isLoading || !postDetailQuery.data ? (
          <Skeleton className="h-44 rounded-xl" />
        ) : (
          <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {postDetailQuery.data.post.author.name} ·{' '}
                {new Date(postDetailQuery.data.post.createdAt).toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await toggleCommunityVote('post', postDetailQuery.data!.post.id);
                    void postDetailQuery.refetch();
                  }}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {postDetailQuery.data.post.helpfulCount}
                </Button>
                {postDetailQuery.data.post.isOwn || isMod ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteCommunityPost(postDetailQuery.data!.post.id);
                      setSearchParams({});
                      void postsQuery.refetch();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                  </Button>
                ) : null}
                {isMod ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await moderateInCommunity(comm.id, {
                        action: postDetailQuery.data!.post.isPinned ? 'unpin' : 'pin',
                        targetType: 'post',
                        targetId: postDetailQuery.data!.post.id,
                      });
                      void postDetailQuery.refetch();
                    }}
                  >
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setReportTarget({
                      type: 'post',
                      id: postDetailQuery.data!.post.id,
                      label: postDetailQuery.data!.post.title,
                    })
                  }
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="rounded-xl bg-surface2/40 p-3 text-sm">
              <MarkdownContent content={postDetailQuery.data.post.body ?? ''} />
              {postDetailQuery.data.post.attachments?.map((att) => (
                <a
                  key={att.id}
                  href={communityAttachmentUrl(att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 underline"
                >
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {att.originalName}
                </a>
              ))}
            </div>

            {postDetailQuery.data.post.aiAttempt ? (
              <div className="rounded-xl border border-primary-300/40 bg-primary-500/5 p-3 text-xs">
                <p className="mb-1 font-semibold text-primary-600">
                  AWAL AI attempt attached by asker:
                </p>
                <MarkdownContent content={postDetailQuery.data.post.aiAttempt} />
              </div>
            ) : null}

            <div className="space-y-2.5">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                Answers &amp; Replies ({postDetailQuery.data.replies.length})
              </h4>
              {postDetailQuery.data.replies.map((r) => (
                <div
                  key={r.id}
                  className={`space-y-1.5 rounded-xl border p-3 ${
                    r.isAccepted
                      ? 'border-emerald-400/70 bg-emerald-500/10'
                      : 'border-line/70 bg-surface2/30'
                  } ${r.parentReplyId ? 'ml-5' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-fg">{r.author.name}</span>
                      {r.isAiGenerated ? <Badge tone="primary">AI-assisted draft</Badge> : null}
                      {r.isAccepted ? (
                        <Badge tone="success" className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Accepted
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await toggleCommunityVote('reply', r.id);
                          void postDetailQuery.refetch();
                        }}
                      >
                        <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                        {r.helpfulCount}
                      </Button>
                      {postDetailQuery.data!.post.isOwn && !r.isAccepted ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await acceptCommunityReply(postDetailQuery.data!.post.id, r.id);
                            void postDetailQuery.refetch();
                            toast.show({ kind: 'success', title: 'Marked as accepted answer' });
                          }}
                        >
                          Accept
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setReplyParentId(r.id)}>
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReportTarget({ type: 'reply', id: r.id })}
                      >
                        <Flag className="h-3 w-3" aria-hidden="true" />
                      </Button>
                      {isMod ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await moderateInCommunity(comm.id, {
                              action: 'hide',
                              targetType: 'reply',
                              targetId: r.id,
                            });
                            void postDetailQuery.refetch();
                          }}
                        >
                          <EyeOff className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-fg/90">
                    <MarkdownContent content={r.body} />
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Composer */}
            <form onSubmit={handleCreateReply} className="space-y-2 border-t border-line pt-3">
              {replyParentId ? (
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Replying to thread</span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setReplyParentId(null)}
                  >
                    Cancel thread
                  </button>
                </div>
              ) : null}
              <Textarea
                label="Your answer"
                rows={3}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a helpful answer (Markdown & $math$ supported)..."
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={replyAnon}
                      onChange={(e) => setReplyAnon(e.target.checked)}
                    />
                    Anonymous
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={awalLoading}
                    onClick={() => void handleDraftWithAwal()}
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Draft with AWAL
                  </Button>
                </div>
                <Button type="submit" size="sm" loading={submittingReply}>
                  Post reply
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* Create Study Group Modal */}
      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="Create study group">
        <form onSubmit={handleCreateGroup} className="space-y-3 text-sm">
          <Input
            label="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Exam Prep Squad"
            required
          />
          <Textarea
            label="Description (optional)"
            rows={2}
            value={groupDesc}
            onChange={(e) => setGroupDesc(e.target.value)}
          />
          <label className="block space-y-1 text-xs">
            <span className="font-medium">Visibility</span>
            <select
              value={groupVis}
              onChange={(e) => setGroupVis(e.target.value as 'public_course' | 'invite_only')}
              className="h-9 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-fg"
            >
              <option value="public_course">Public to this course</option>
              <option value="invite_only">Invite only (via invite code)</option>
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={creatingGroup}>
              Create group
            </Button>
          </div>
        </form>
      </Modal>

      {/* Share Resource Modal */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share course resource">
        <form onSubmit={handleShareResource} className="space-y-3 text-sm">
          <label className="block space-y-1 text-xs">
            <span className="font-medium">Resource type</span>
            <select
              value={shareType}
              onChange={(e) =>
                setShareType(e.target.value as 'link' | 'note_copy' | 'document' | 'recommendation')
              }
              className="h-9 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-fg"
            >
              <option value="link">Study Link</option>
              <option value="note_copy">Read-only Note Summary</option>
              <option value="document">Document Summary</option>
            </select>
          </label>
          <Input
            label="Title"
            value={shareTitle}
            onChange={(e) => setShareTitle(e.target.value)}
            required
          />
          {shareType === 'link' ? (
            <Input
              label="URL"
              type="url"
              value={shareUrl}
              onChange={(e) => setShareUrl(e.target.value)}
              placeholder="https://openstax.org/..."
              required
            />
          ) : null}
          <Textarea
            label="Notes / summary"
            rows={3}
            value={shareDesc}
            onChange={(e) => setShareDesc(e.target.value)}
          />
          <label className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-fg">
            <input
              type="checkbox"
              checked={shareRightConfirmed}
              onChange={(e) => setShareRightConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line"
              required
            />
            <span>
              Only share material you have the right to share (no pirated textbooks or copyrighted
              exam papers).
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={sharingResource}
              disabled={!shareRightConfirmed}
            >
              Share resource
            </Button>
          </div>
        </form>
      </Modal>

      <CommunityRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onAccepted={() => {
          setRulesOpen(false);
          void homeQuery.refetch();
        }}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <BlockUserModal
        user={blockTarget}
        onClose={() => setBlockTarget(null)}
        onBlocked={() => void postsQuery.refetch()}
      />
    </div>
  );
}
