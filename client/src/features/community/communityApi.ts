import { API_BASE_URL, getAccessToken, request } from '../../lib/apiClient';

export interface CommunityAuthor {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  helpedCount?: number;
  badge?: string | null;
  isAnonymous?: boolean;
}

export interface CommunitySummary {
  id: string;
  slug: string;
  displayName: string;
  universityName: string | null;
  role: 'member' | 'moderator' | 'course_rep';
  isPaused: boolean;
  memberCount: number;
  postCount: number;
  groupCount: number;
}

export interface CommunityFeedPostItem extends CommunityPostSummary {
  isBookmarked?: boolean;
}

export interface CommunityDashboardResponse {
  learnerType: 'university' | 'shs';
  userSummary: {
    id: string;
    name: string;
    schoolYear: string | null;
    programme: string | null;
    university: string | null;
  };
  rulesAccepted: boolean;
  stats: {
    totalStudents: number;
    totalPosts: number;
    solvedDiscussions: number;
    totalGroups: number;
    totalResources: number;
    followingCount: number;
    joinedSubjectsCount: number;
    myGroupsCount: number;
  };
  popularSubjects: Array<{
    id: string;
    slug: string;
    displayName: string;
    universityName: string | null;
    isPaused: boolean;
    memberCount: number;
    postCount: number;
    groupCount: number;
    isJoined: boolean;
  }>;
  trendingDiscussions: CommunityPostSummary[];
  suggestedGroups: Array<{
    id: string;
    name: string;
    description: string | null;
    visibility: 'public_course' | 'invite_only';
    communityId: string;
    communityName: string;
    memberCount: number;
    messageCount: number;
  }>;
  suggestedStudents: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    subtitle: string;
    sharedCount: number;
    helpedCount: number;
    badge: string | null;
    isFollowing: boolean;
  }>;
  recentActivities: Array<{
    id: string;
    kind: 'question' | 'post' | 'resource' | 'group';
    actorName: string;
    title: string;
    targetName: string;
    communityId: string;
    postId: string | null;
    groupId: string | null;
    createdAt: string;
  }>;
  myBookmarkedIds: string[];
  myFollowingIds: string[];
}

export interface CommunityDiscoverResponse {
  communities: Array<{
    id: string;
    slug: string;
    displayName: string;
    universityName: string | null;
    isPaused: boolean;
    memberCount: number;
    postCount: number;
    groupCount: number;
    isJoined: boolean;
  }>;
  students: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    subtitle: string;
    sharedCount: number;
    helpedCount: number;
    badge: string | null;
    isFollowing: boolean;
  }>;
  popularTags: Array<{ tag: string; count: number }>;
}

export interface CommunityLeaderboardResponse {
  learnerType: 'university' | 'shs';
  myStats: {
    rank: number | null;
    helpedCount: number;
    acceptedCount: number;
    badge: string | null;
    hideStats: boolean;
  };
  leaders: Array<{
    rank: number;
    userId: string;
    name: string;
    avatarUrl: string | null;
    subtitle: string;
    helpedCount: number;
    acceptedCount: number;
    badge: string | null;
    isMe: boolean;
  }>;
}

export interface StudyGroupSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public_course' | 'invite_only';
  role: 'owner' | 'moderator' | 'member';
  muted: boolean;
  communityId: string;
  communityName: string;
  memberCount: number;
  messageCount: number;
}

export interface CommunityPostSummary {
  id: string;
  communityId: string;
  communityName?: string;
  type: 'question' | 'discussion' | 'resource' | 'announcement';
  title: string;
  body?: string;
  topicTag: string | null;
  status: 'unanswered' | 'answered' | 'resolved';
  isAnonymous?: boolean;
  isPinned?: boolean;
  acceptedReplyId?: string | null;
  replyCount: number;
  helpfulCount: number;
  aiAttempt?: string | null;
  hasVoted?: boolean;
  isOwn?: boolean;
  createdAt: string;
  author: CommunityAuthor;
  attachments?: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    kind: 'image' | 'document';
    sizeBytes: number;
  }>;
}

export interface CommunityHomeResponse {
  rulesAccepted: boolean;
  profile: {
    helpedCount: number;
    acceptedCount: number;
    badge: string | null;
    hideStats: boolean;
    showInClassmates: boolean;
  };
  examNotice: { enabled: boolean; message: string | null };
  communities: CommunitySummary[];
  myGroups: StudyGroupSummary[];
  unanswered: CommunityPostSummary[];
  trending: CommunityPostSummary[];
}

export interface CommunityReplyItem {
  id: string;
  postId: string;
  parentReplyId: string | null;
  body: string;
  isAnonymous: boolean;
  isAiGenerated: boolean;
  isAccepted: boolean;
  helpfulCount: number;
  hasVoted: boolean;
  isOwn: boolean;
  author: CommunityAuthor;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    kind: 'image' | 'document';
    sizeBytes: number;
  }>;
  createdAt: string;
}

export interface GroupMessageItem {
  id: string;
  groupId: string;
  body: string;
  isAiGenerated: boolean;
  linkPreview: { url: string; domain: string } | null;
  replyTo: { id: string; body: string; authorName: string } | null;
  isOwn: boolean;
  author: CommunityAuthor;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    kind: 'image' | 'document';
    sizeBytes: number;
  }>;
  createdAt: string;
}

export interface SharedResourceItem {
  id: string;
  communityId: string;
  communityName: string;
  groupId: string | null;
  sourceType: 'note_copy' | 'document' | 'link' | 'recommendation';
  title: string;
  description: string | null;
  bodySnapshot: string | null;
  url: string | null;
  sourceDomain: string | null;
  helpfulCount: number;
  isOwn: boolean;
  author: CommunityAuthor;
  createdAt: string;
}

export interface CommunityNotificationPrefs {
  inAppAnswer: boolean;
  inAppAccepted: boolean;
  inAppReply: boolean;
  inAppGroupInvite: boolean;
  inAppMention: boolean;
  emailAnswer: boolean;
  emailAccepted: boolean;
  emailReply: boolean;
  emailGroupInvite: boolean;
  emailMention: boolean;
  emailDailyDigest: boolean;
}

export function fetchCommunityHome() {
  return request<CommunityHomeResponse>('/community/home');
}

export function fetchCommunityDashboard() {
  return request<CommunityDashboardResponse>('/community/dashboard');
}

export function fetchCommunityFeed(params?: {
  filter?: 'all' | 'following' | 'unanswered' | 'trending' | 'resources' | 'bookmarks';
  type?: 'all' | 'question' | 'discussion' | 'resource' | 'announcement';
  communityId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.filter) sp.set('filter', params.filter);
  if (params?.type) sp.set('type', params.type);
  if (params?.communityId) sp.set('communityId', params.communityId);
  if (params?.q) sp.set('q', params.q);
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return request<{ items: CommunityFeedPostItem[]; nextCursor: string | null }>(
    `/community/feed${qs ? `?${qs}` : ''}`,
  );
}

export function fetchCommunityDiscover(q?: string) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return request<CommunityDiscoverResponse>(`/community/discover${qs}`);
}

export function fetchCommunityGroupsHub(params?: { communityId?: string; q?: string }) {
  const sp = new URLSearchParams();
  if (params?.communityId) sp.set('communityId', params.communityId);
  if (params?.q) sp.set('q', params.q);
  const qs = sp.toString();
  return request<{
    myGroups: StudyGroupSummary[];
    discoverGroups: Array<{
      id: string;
      name: string;
      description: string | null;
      visibility: 'public_course' | 'invite_only';
      communityId: string;
      communityName: string;
      memberCount: number;
      messageCount: number;
    }>;
    communities: Array<{ id: string; displayName: string }>;
  }>(`/community/groups${qs ? `?${qs}` : ''}`);
}

export function fetchCommunityLeaderboard() {
  return request<CommunityLeaderboardResponse>('/community/leaderboard');
}

export function joinCourseCommunity(communityId: string) {
  return request<{ joined: boolean; communityId: string }>(
    `/community/courses/${communityId}/join`,
    { method: 'POST' },
  );
}

export function toggleFollowStudent(targetUserId: string) {
  return request<{ following: boolean }>(`/community/users/${targetUserId}/follow`, {
    method: 'POST',
  });
}

export function toggleBookmarkPost(postId: string) {
  return request<{ bookmarked: boolean }>(`/community/posts/${postId}/bookmark`, {
    method: 'POST',
  });
}

export function acceptCommunityRules() {
  return request<{ rulesAcceptedAt: string }>('/community/rules/accept', { method: 'POST' });
}

export function updateCommunityProfile(body: { hideStats?: boolean; showInClassmates?: boolean }) {
  return request('/community/profile', { method: 'PATCH', body });
}

export function switchCourseCommunity(
  courseId: string,
  body: { scope?: 'university' | 'global'; communityId?: string },
) {
  return request<{ communityId: string }>(`/community/courses/${courseId}/switch`, {
    method: 'POST',
    body,
  });
}

export function fetchCommunityDetail(communityId: string) {
  return request<{
    id: string;
    slug: string;
    displayName: string;
    universityName: string | null;
    isPaused: boolean;
    myRole: 'member' | 'moderator' | 'course_rep';
    memberCount: number;
    postCount: number;
    groupCount: number;
    examNotice: { enabled: boolean; message: string | null };
    classmates: Array<CommunityAuthor & { role: string }>;
  }>(`/community/courses/${communityId}`);
}

export function leaveCommunity(communityId: string) {
  return request<void>(`/community/courses/${communityId}/leave`, { method: 'POST' });
}

export function fetchCommunityPosts(
  communityId: string,
  params?: {
    cursor?: string;
    filter?: 'all' | 'unanswered' | 'my_questions' | 'my_answers' | 'resources';
    topic?: string;
    q?: string;
  },
) {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.filter) sp.set('filter', params.filter);
  if (params?.topic) sp.set('topic', params.topic);
  if (params?.q) sp.set('q', params.q);
  const qs = sp.toString();
  return request<{ items: CommunityPostSummary[]; nextCursor: string | null }>(
    `/community/courses/${communityId}/posts${qs ? `?${qs}` : ''}`,
  );
}

export function createCommunityPost(
  communityId: string,
  body: {
    type: 'question' | 'discussion' | 'resource' | 'announcement';
    title: string;
    body: string;
    topicTag?: string | null;
    isAnonymous?: boolean;
    aiAttempt?: string | null;
    attachmentIds?: string[];
  },
) {
  return request<{ id: string; flaggedByFilter: boolean }>(
    `/community/courses/${communityId}/posts`,
    { method: 'POST', body },
  );
}

export function fetchPostDetail(postId: string) {
  return request<{
    post: CommunityPostSummary & { myRole: string };
    replies: CommunityReplyItem[];
  }>(`/community/posts/${postId}`);
}

export function deleteCommunityPost(postId: string) {
  return request<void>(`/community/posts/${postId}`, { method: 'DELETE' });
}

export function createCommunityReply(
  postId: string,
  body: {
    body: string;
    parentReplyId?: string | null;
    isAnonymous?: boolean;
    isAiGenerated?: boolean;
    attachmentIds?: string[];
  },
) {
  return request<{ id: string }>(`/community/posts/${postId}/replies`, { method: 'POST', body });
}

export function acceptCommunityReply(postId: string, replyId: string) {
  return request(`/community/posts/${postId}/accept/${replyId}`, { method: 'POST' });
}

export function toggleCommunityVote(targetType: 'post' | 'reply' | 'resource', targetId: string) {
  return request<{ voted: boolean; helpfulCount: number }>('/community/votes', {
    method: 'POST',
    body: { targetType, targetId },
  });
}

export function askAwalFirst(body: {
  title: string;
  body: string;
  mode?: 'ask_first' | 'draft_helper';
}) {
  return request<{ answer: string; isAiGenerated: true }>('/community/ai/ask-awal', {
    method: 'POST',
    body,
  });
}

export function reportCommunityContent(body: {
  targetType: 'post' | 'reply' | 'message' | 'resource' | 'user';
  targetId: string;
  reason: string;
}) {
  return request<{ id: string; status: string }>('/community/reports', { method: 'POST', body });
}

export function blockCommunityUser(userId: string) {
  return request('/community/blocks', { method: 'POST', body: { userId } });
}

export function moderateInCommunity(
  communityId: string,
  body: {
    action: 'pin' | 'unpin' | 'hide' | 'unhide' | 'delete' | 'mute_user';
    targetType: 'post' | 'reply' | 'resource' | 'user';
    targetId: string;
    reason?: string;
    muteHours?: number;
  },
) {
  return request(`/community/courses/${communityId}/moderate`, { method: 'POST', body });
}

// Study Groups
export function fetchCommunityGroups(communityId: string) {
  return request<
    Array<{
      id: string;
      communityId: string;
      name: string;
      description: string | null;
      visibility: 'public_course' | 'invite_only';
      inviteCode: string | null;
      memberCount: number;
      messageCount: number;
      isMember: boolean;
      myRole: string | null;
      muted: boolean;
    }>
  >(`/community/courses/${communityId}/groups`);
}

export function createStudyGroup(body: {
  communityId: string;
  name: string;
  description?: string | null;
  visibility: 'public_course' | 'invite_only';
}) {
  return request<{ id: string; inviteCode: string }>('/community/groups', { method: 'POST', body });
}

export function joinStudyGroup(groupId: string) {
  return request(`/community/groups/${groupId}/join`, { method: 'POST' });
}

export function joinGroupByInviteCode(inviteCode: string) {
  return request<{ joined: boolean; groupId: string; name: string }>(
    '/community/groups/join-code',
    { method: 'POST', body: { inviteCode } },
  );
}

export function leaveStudyGroup(groupId: string) {
  return request<void>(`/community/groups/${groupId}/leave`, { method: 'POST' });
}

export function toggleMuteStudyGroup(groupId: string, muted: boolean) {
  return request(`/community/groups/${groupId}/mute`, { method: 'PATCH', body: { muted } });
}

export function inviteClassmateToGroup(groupId: string, targetUserId: string) {
  return request(`/community/groups/${groupId}/invite/${targetUserId}`, { method: 'POST' });
}

export function fetchGroupDetail(groupId: string) {
  return request<{
    id: string;
    communityId: string;
    communityName: string;
    name: string;
    description: string | null;
    visibility: string;
    inviteCode: string;
    myRole: 'owner' | 'moderator' | 'member';
    muted: boolean;
    activeFocusTitle: string | null;
    activeFocusEndsAt: string | null;
    onlineParticipants: Array<{ userId: string; userName: string }>;
    pinnedMessage: { id: string; body: string; authorName: string } | null;
    members: Array<{ userId: string; name: string; avatarUrl: string | null; role: string }>;
    tasks: Array<{ id: string; title: string; dueAt: string | null; done: boolean }>;
  }>(`/community/groups/${groupId}`);
}

export function fetchGroupMessages(groupId: string, cursor?: string) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<{ items: GroupMessageItem[]; nextCursor: string | null }>(
    `/community/groups/${groupId}/messages${qs}`,
  );
}

export function sendGroupMessage(
  groupId: string,
  body: {
    body: string;
    replyToId?: string | null;
    clientMessageId?: string;
    attachmentIds?: string[];
  },
) {
  return request<GroupMessageItem>(`/community/groups/${groupId}/messages`, {
    method: 'POST',
    body,
  });
}

export function deleteGroupMessage(groupId: string, messageId: string) {
  return request<void>(`/community/groups/${groupId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export function pinGroupMessage(groupId: string, messageId: string) {
  return request(`/community/groups/${groupId}/messages/${messageId}/pin`, { method: 'POST' });
}

export function sendGroupTyping(groupId: string) {
  return request<void>(`/community/groups/${groupId}/typing`, { method: 'POST' });
}

export function createGroupTask(groupId: string, title: string) {
  return request(`/community/groups/${groupId}/tasks`, { method: 'POST', body: { title } });
}

export function toggleGroupTask(groupId: string, taskId: string, done: boolean) {
  return request(`/community/groups/${groupId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: { done },
  });
}

export function syncGroupTaskToPlanner(groupId: string, taskId: string) {
  return request(`/community/groups/${groupId}/tasks/${taskId}/sync-planner`, {
    method: 'POST',
  });
}

export function startGroupFocus(groupId: string, title: string, durationMinutes: number) {
  return request<{ title: string; endsAt: string }>(`/community/groups/${groupId}/focus`, {
    method: 'POST',
    body: { title, durationMinutes },
  });
}

// Resources & Attachments
export function fetchSharedResources(communityId: string, groupId?: string) {
  const sp = new URLSearchParams();
  if (groupId) sp.set('groupId', groupId);
  const qs = sp.toString();
  return request<{ items: SharedResourceItem[]; nextCursor: string | null }>(
    `/community/courses/${communityId}/resources${qs ? `?${qs}` : ''}`,
  );
}

export function shareCommunityResource(body: {
  communityId: string;
  groupId?: string | null;
  sourceType: 'note_copy' | 'document' | 'link' | 'recommendation';
  sourceId?: string;
  title: string;
  description?: string | null;
  url?: string | null;
  rightConfirmed: true;
}) {
  return request('/community/resources', { method: 'POST', body });
}

export function saveSharedResourceToCourse(resourceId: string) {
  return request<{ savedAs: string; id: string }>(`/community/resources/${resourceId}/save`, {
    method: 'POST',
  });
}

export async function uploadCommunityAttachment(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/community/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Could not upload attachment');
  }
  return (await res.json()) as {
    id: string;
    originalName: string;
    mimeType: string;
    kind: 'image' | 'document';
    sizeBytes: number;
  };
}

export function communityAttachmentUrl(attachmentId: string) {
  return `${API_BASE_URL}/community/attachments/${attachmentId}/content`;
}

export function fetchCommunityNotifPrefs() {
  return request<CommunityNotificationPrefs>('/community/notifications/preferences');
}

export function updateCommunityNotifPrefs(body: Partial<CommunityNotificationPrefs>) {
  return request<CommunityNotificationPrefs>('/community/notifications/preferences', {
    method: 'PATCH',
    body,
  });
}

export function subscribeGroupStream(
  groupId: string,
  handlers: {
    onEvent: (event: string, data: unknown) => void;
    onError?: () => void;
  },
): () => void {
  const controller = new AbortController();
  const token = getAccessToken();

  void (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/community/groups/${groupId}/stream`, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        handlers.onError?.();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          if (!block.trim() || block.startsWith(':')) continue;
          let eventName = 'message';
          let dataLine = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (dataLine) {
            try {
              handlers.onEvent(eventName, JSON.parse(dataLine));
            } catch {
              // ignore malformed SSE chunk
            }
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) handlers.onError?.();
    }
  })();

  return () => controller.abort();
}
