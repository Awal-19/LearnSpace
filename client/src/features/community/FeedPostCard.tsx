import {
  Award,
  Bookmark,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Pin,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Avatar, Badge, GlassCard } from '../../design';
import type { CommunityFeedPostItem } from './communityApi';

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

const TYPE_META: Record<
  CommunityFeedPostItem['type'],
  { label: string; tone: 'primary' | 'neutral' | 'success' | 'warning' }
> = {
  question: { label: 'Question', tone: 'warning' },
  discussion: { label: 'Discussion', tone: 'primary' },
  resource: { label: 'Resource', tone: 'success' },
  announcement: { label: 'Announcement', tone: 'neutral' },
};

export function FeedPostCard({
  post,
  onVote,
  onBookmark,
}: {
  post: CommunityFeedPostItem;
  onVote: (postId: string) => void;
  onBookmark: (postId: string) => void;
}) {
  const path = useAppPath();
  const typeMeta = TYPE_META[post.type] ?? TYPE_META.discussion;

  return (
    <GlassCard className="group space-y-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300/80 hover:shadow-md sm:p-5">
      {/* Author & Meta */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar name={post.author.name} src={post.author.avatarUrl} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-fg">{post.author.name}</span>
              {post.author.badge ? (
                <Badge tone="success" className="inline-flex items-center gap-1 text-[11px]">
                  <Award className="h-3 w-3" aria-hidden="true" />
                  {post.author.badge}
                </Badge>
              ) : null}
              <span className="text-xs text-muted">· {formatRelativeTime(post.createdAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {post.communityName ? (
                <Link
                  to={path(`/community/courses/${post.communityId}`)}
                  className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  <BookOpen className="h-3 w-3" aria-hidden="true" />
                  {post.communityName}
                </Link>
              ) : null}
              {post.topicTag ? <span>· #{post.topicTag}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {post.isPinned ? (
            <Badge tone="primary" className="inline-flex items-center gap-1">
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned
            </Badge>
          ) : null}
          <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
          {post.type === 'question' ? (
            <Badge
              tone={
                post.status === 'resolved'
                  ? 'success'
                  : post.status === 'answered'
                    ? 'primary'
                    : 'neutral'
              }
              className="inline-flex items-center gap-1"
            >
              {post.status === 'resolved' ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              ) : (
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
              )}
              {post.status}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <Link
        to={path(`/community/courses/${post.communityId}?post=${post.id}`)}
        className="block space-y-1.5"
      >
        <h3 className="font-display text-base font-semibold text-fg transition-colors group-hover:text-primary-600 sm:text-lg">
          {post.title}
        </h3>
        {post.body ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted">{post.body}</p>
        ) : null}
      </Link>

      {/* Attachments / AI note */}
      {(post.attachments?.length ?? 0) > 0 || post.aiAttempt ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {(post.attachments?.length ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface2 px-2 py-1">
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              {post.attachments!.length} attachment{post.attachments!.length > 1 ? 's' : ''}
            </span>
          ) : null}
          {post.aiAttempt ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary-500/10 px-2 py-1 text-primary-700 dark:text-primary-300">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Includes AWAL first-pass
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onVote(post.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-medium transition-colors ${
              post.hasVoted
                ? 'bg-primary-600 text-white'
                : 'bg-surface2/80 text-muted hover:bg-surface2 hover:text-fg'
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{post.helpfulCount}</span>
            <span className="hidden sm:inline">Helpful</span>
          </button>

          <Link
            to={path(`/community/courses/${post.communityId}?post=${post.id}`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-surface2/80 px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-surface2 hover:text-fg"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{post.replyCount}</span>
            <span className="hidden sm:inline">{post.replyCount === 1 ? 'Reply' : 'Replies'}</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => onBookmark(post.id)}
          aria-label={post.isBookmarked ? 'Remove bookmark' : 'Save discussion'}
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 font-medium transition-colors ${
            post.isBookmarked
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'text-muted hover:bg-surface2 hover:text-fg'
          }`}
        >
          <Bookmark
            className={`h-3.5 w-3.5 ${post.isBookmarked ? 'fill-current' : ''}`}
            aria-hidden="true"
          />
          <span>{post.isBookmarked ? 'Saved' : 'Save'}</span>
        </button>
      </div>
    </GlassCard>
  );
}
