import { ADMIN_API_BASE_URL, downloadFile, request } from '../../lib/apiClient';

export type AdminRange = '7d' | '30d' | '90d' | 'custom';

export interface AdminOverviewResponse {
  stats: {
    totalUsers: number;
    newToday: number;
    new7d: number;
    new30d: number;
    dau: number;
    wau: number;
    mau: number;
    verifiedUsers: number;
    unverifiedUsers: number;
    totalAiMessages: number;
    totalUploads: number;
    totalNotes: number;
    totalQuizzesTaken: number;
    totalDocumentsProcessed: number;
  };
  series: Array<{
    date: string;
    signups: number;
    dau: number;
    aiMessages: number;
    uploads: number;
  }>;
  topFeatures: Array<{ feature: string; count: number }>;
  topCourses: Array<{ id: string; name: string; activityCount: number }>;
  recentSignups: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    emailVerified: boolean;
    createdAt: string;
  }>;
  recentErrors: Array<{
    id: string;
    route: string;
    method: string;
    statusCode: number;
    code: string;
    message: string;
    createdAt: string;
  }>;
  systemHealth: {
    api: string;
    database: string;
    email: string;
    emailProvider?: string;
    recentEmailErrors?: Array<{
      id: string;
      recipientEmail: string;
      kind: string;
      provider: string;
      errorMessage: string | null;
      createdAt: string;
    }>;
    ai: string;
    storage: string;
  };
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin' | 'super_admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  programme: string | null;
  level: string | null;
  university: string | null;
  authMethod: 'email' | 'google';
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AdminUsersListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: AdminUserListItem[];
}

export interface AdminUserDetailResponse {
  user: AdminUserListItem & {
    suspendedAt: string | null;
    suspendedReason: string | null;
    twoFactorEnabled: boolean;
    studentId: string | null;
    bio: string | null;
    avatarUrl: string | null;
  };
  stats: {
    aiMessages: number;
    uploads: number;
    notes: number;
    quizzesTaken: number;
    studyHours: number;
    streak: number;
  };
  lastEmailDelivery?: {
    status: string;
    provider: string;
    kind: string;
    providerMessageId: string | null;
    errorMessage: string | null;
    createdAt: string;
  } | null;
  recentActivity: Array<{
    id: string;
    action: string;
    metadataJson: Record<string, unknown>;
    createdAt: string;
  }>;
  recentLogins: Array<{
    id: string;
    method: 'email' | 'google';
    success: boolean;
    ip: string | null;
    suspicious: boolean;
    reason: string | null;
    createdAt: string;
  }>;
}

export function adminRequest<T>(path: string, options: Parameters<typeof request<T>>[1] = {}) {
  return request<T>(path, { ...options, baseUrl: ADMIN_API_BASE_URL, cookie: true });
}

export function fetchAdminOverview(params: { range: AdminRange; from?: string; to?: string }) {
  const sp = new URLSearchParams({ range: params.range });
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  return adminRequest<AdminOverviewResponse>(`/overview?${sp.toString()}`);
}

export function fetchAdminUsers(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  return adminRequest<AdminUsersListResponse>(`/users?${sp.toString()}`);
}

export function fetchAdminUserDetail(userId: string) {
  return adminRequest<AdminUserDetailResponse>(`/users/${userId}`);
}

export function updateAdminUserStatus(
  userId: string,
  status: 'active' | 'suspended',
  reason?: string,
) {
  return adminRequest<{ user: { id: string; status: string } }>(`/users/${userId}/status`, {
    method: 'PATCH',
    body: { status, reason },
  });
}

export function forceLogoutAdminUser(userId: string) {
  return adminRequest<void>(`/users/${userId}/force-logout`, { method: 'POST' });
}

export function resendAdminUserVerification(userId: string) {
  return adminRequest<{ sent: true; maskedEmail: string }>(`/users/${userId}/resend-verification`, {
    method: 'POST',
  });
}

export function markAdminUserVerified(userId: string, reason: string) {
  return adminRequest<{ emailVerified: true }>(`/users/${userId}/mark-verified`, {
    method: 'POST',
    body: { reason },
  });
}

export function triggerAdminUserReset(userId: string) {
  return adminRequest<void>(`/users/${userId}/trigger-reset`, { method: 'POST' });
}

export function updateAdminUserRole(
  userId: string,
  role: 'student' | 'admin' | 'super_admin',
  reason?: string,
) {
  return adminRequest<{ user: { id: string; role: string } }>(`/users/${userId}/role`, {
    method: 'PATCH',
    body: { role, reason },
  });
}

export function deleteAdminUser(userId: string) {
  return adminRequest<void>(`/users/${userId}`, { method: 'DELETE' });
}

export async function bulkAdminUsers(params: {
  action: 'suspend' | 'export_csv';
  userIds: string[];
  reason?: string;
}): Promise<void> {
  if (params.action === 'suspend') {
    await adminRequest('/users/bulk', { method: 'POST', body: params });
    return;
  }

  await downloadFile('/users/bulk', 'learnspace-users.csv', {
    baseUrl: ADMIN_API_BASE_URL,
    method: 'POST',
    body: params,
    cookie: true,
  });
}

export interface AdminAiUsageResponse {
  summary: {
    totalRequests: number;
    tokensIn: number;
    tokensOut: number;
    costRangeUsd: number;
    costTodayUsd: number;
    costMonthUsd: number;
    avgDurationMs: number;
    errorRatePct: number;
    alertTriggered: boolean;
  };
  limits: {
    dailyMessageLimit: number;
    maxUploadBytes: number;
    dailyUploadQuota: number;
    dailyCostAlertUsd: number;
  };
  byFeature: Array<{
    feature: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  }>;
  daily: Array<{ date: string; requests: number; costUsd: number; tokens: number }>;
  topUsers: Array<{
    userId: string;
    name: string;
    email: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
}

export function fetchAdminAiUsage(range: AdminRange) {
  return adminRequest<AdminAiUsageResponse>(`/ai-usage?range=${range}`);
}

export function updateAdminAiLimits(limits: Partial<AdminAiUsageResponse['limits']>) {
  return adminRequest('/ai-usage/limits', { method: 'PATCH', body: limits });
}

export function fetchAdminConversations(params: { q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.page) sp.set('page', String(params.page));
  return adminRequest<{
    total: number;
    items: Array<{
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      user: { id: string; name: string; email: string };
      _count: { messages: number; attachments: number };
    }>;
  }>(`/conversations?${sp.toString()}`);
}

export function inspectAdminConversation(id: string, reason: string) {
  return adminRequest<{
    conversation: {
      id: string;
      title: string;
      user: { id: string; name: string; email: string };
      messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
    };
  }>(`/conversations/${id}/inspect`, { method: 'POST', body: { reason } });
}

export function fetchAdminUploads(page = 1) {
  return adminRequest<{
    total: number;
    totalStorageBytes: number;
    items: Array<{
      id: string;
      source: 'attachment' | 'document';
      name: string;
      mimeType: string;
      sizeBytes: number;
      status: string;
      owner: { id: string; name: string; email: string };
      createdAt: string;
    }>;
  }>(`/uploads?page=${page}`);
}

export function inspectAdminUpload(source: 'attachment' | 'document', id: string, reason: string) {
  return adminRequest<{
    item: {
      id: string;
      name: string;
      mimeType: string;
      extractedText: string | null;
      signedUrl: string | null;
    };
  }>(`/uploads/${source}/${id}/inspect`, { method: 'POST', body: { reason } });
}

export function deleteAdminUpload(source: 'attachment' | 'document', id: string) {
  return adminRequest<void>(`/uploads/${source}/${id}`, { method: 'DELETE' });
}

export function fetchAdminFlagged(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<{
    total: number;
    items: Array<{
      id: string;
      reason: string;
      status: 'open' | 'dismissed' | 'warned' | 'suspended';
      reviewNote: string | null;
      createdAt: string;
      targetUser: { id: string; name: string; email: string; status: string };
      reporter: { id: string; name: string; email: string } | null;
    }>;
  }>(`/flagged${qs}`);
}

export function resolveAdminFlag(
  id: string,
  status: 'dismissed' | 'warned' | 'suspended',
  reviewNote?: string,
) {
  return adminRequest(`/flagged/${id}`, { method: 'PATCH', body: { status, reviewNote } });
}

export interface AdminLearningResponse {
  totals: {
    totalQuizzes: number;
    totalQuizAttempts: number;
    avgQuizScorePct: number;
    totalDecks: number;
    totalCards: number;
    totalNotes: number;
    totalTasks: number;
    completedTasks: number;
    taskCompletionRatePct: number;
    totalStudyHours: number;
    totalCourses: number;
    totalTimetableEntries: number;
    totalExams: number;
    totalRevisionPlans: number;
    totalFlashcardReviews: number;
    totalDocuments: number;
    totalPracticeAttempts: number;
    totalGradingScales: number;
    totalGradeRecords: number;
  };
  popularCourses: Array<{
    id: string;
    name: string;
    notes: number;
    tasks: number;
    documents: number;
    total: number;
  }>;
  programmeBreakdown: Array<{ label: string; count: number }>;
  levelBreakdown: Array<{ label: string; count: number }>;
}

export function fetchAdminLearning() {
  return adminRequest<AdminLearningResponse>('/learning');
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'programme' | 'level';
  audienceValue: string | null;
  scheduledAt: string | null;
  sendEmail: boolean;
  active: boolean;
  createdAt: string;
}

export function fetchAdminAnnouncements() {
  return adminRequest<{ items: AdminAnnouncement[] }>('/announcements');
}

export function createAdminAnnouncement(body: {
  title: string;
  message: string;
  audience: 'all' | 'programme' | 'level';
  audienceValue?: string | null;
  scheduledAt?: string | null;
  sendEmail: boolean;
}) {
  return adminRequest<{ announcement: AdminAnnouncement }>('/announcements', {
    method: 'POST',
    body,
  });
}

export function toggleAdminAnnouncement(id: string, active: boolean) {
  return adminRequest(`/announcements/${id}`, { method: 'PATCH', body: { active } });
}

export function deleteAdminAnnouncement(id: string) {
  return adminRequest<void>(`/announcements/${id}`, { method: 'DELETE' });
}

export interface AdminFeedbackItem {
  id: string;
  category: 'bug' | 'suggestion' | 'abuse';
  subject: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  adminNotes: string | null;
  repliedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export function fetchAdminFeedback(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<{ total: number; items: AdminFeedbackItem[] }>(`/feedback${qs}`);
}

export function updateAdminFeedback(
  id: string,
  status: 'new' | 'in_progress' | 'resolved',
  adminNotes?: string,
) {
  return adminRequest(`/feedback/${id}`, { method: 'PATCH', body: { status, adminNotes } });
}

export function replyAdminFeedback(id: string, message: string) {
  return adminRequest(`/feedback/${id}/reply`, { method: 'POST', body: { message } });
}

export function fetchAdminAuditLogs(params: { q?: string; action?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.action) sp.set('action', params.action);
  if (params.page) sp.set('page', String(params.page));
  return adminRequest<{
    total: number;
    items: Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      reason: string | null;
      ip: string | null;
      createdAt: string;
      actor: { id: string; name: string; email: string };
    }>;
  }>(`/audit-logs?${sp.toString()}`);
}

export async function exportAuditLogsCsv() {
  await downloadFile('/audit-logs?format=csv', 'learnspace-audit-logs.csv', {
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function fetchAdminLoginHistory(suspiciousOnly = false) {
  return adminRequest<{
    total: number;
    items: Array<{
      id: string;
      email: string;
      method: string;
      success: boolean;
      ip: string | null;
      suspicious: boolean;
      reason: string | null;
      createdAt: string;
    }>;
  }>(`/login-history${suspiciousOnly ? '?suspicious=true' : ''}`);
}

export function fetchAdminErrorLogs() {
  return adminRequest<{
    total: number;
    items: Array<{
      id: string;
      route: string;
      method: string;
      statusCode: number;
      code: string;
      message: string;
      createdAt: string;
    }>;
  }>('/error-logs');
}

export function fetchAdminSystemHealth() {
  return adminRequest<{
    version: string;
    nodeVersion: string;
    uptimeSeconds: number;
    api: string;
    database: string;
    dbLatencyMs: number;
    email: string;
    emailProvider?: string;
    recentEmailErrors?: Array<{
      id: string;
      recipientEmail: string;
      kind: string;
      provider: string;
      errorMessage: string | null;
      createdAt: string;
    }>;
    ai: string;
    storage: string;
  }>('/health');
}

export interface AdminAppSettings {
  appName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  featureChat: boolean;
  featureUploads: boolean;
  featureDocuments: boolean;
  featureSignups: boolean;
  dailyMessageLimit: number;
  maxUploadBytes: number;
  dailyUploadQuota: number;
  dailyCostAlertUsd: number;
  allowedFileTypesJson: string[];
}

export function fetchAdminSettings() {
  return adminRequest<{ settings: AdminAppSettings }>('/settings');
}

export function updateAdminSettings(settings: Partial<AdminAppSettings>) {
  return adminRequest<{ settings: AdminAppSettings }>('/settings', {
    method: 'PATCH',
    body: settings,
  });
}

export interface AdminExportJob {
  id: string;
  kind: 'users' | 'usage' | 'ai_costs' | 'feedback' | 'overview_pdf';
  status: 'queued' | 'running' | 'completed' | 'failed';
  fileName: string | null;
  error: string | null;
  createdAt: string;
}

export function fetchAdminExports() {
  return adminRequest<{ jobs: AdminExportJob[] }>('/exports');
}

export function createAdminExport(body: {
  kind: AdminExportJob['kind'];
  from?: string;
  to?: string;
}) {
  return adminRequest<{ job: AdminExportJob }>('/exports', { method: 'POST', body });
}

export async function downloadAdminExport(jobId: string, fileName: string) {
  await downloadFile(`/exports/${jobId}/download`, fileName, {
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function fetchActiveAnnouncements() {
  return request<{
    maintenanceMode: boolean;
    maintenanceMessage: string;
    announcements: Array<{ id: string; title: string; message: string }>;
  }>('/announcements/active');
}

export function submitStudentFeedback(body: {
  category: 'bug' | 'suggestion' | 'abuse';
  subject: string;
  message: string;
}) {
  return request('/feedback', { method: 'POST', body });
}

export function fetchAdminConsoleStatus() {
  return request<{ required: boolean; unlocked: boolean }>('/console-unlock/status', {
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function unlockAdminConsole(password: string) {
  return request<{ unlocked: boolean }>('/console-unlock', {
    method: 'POST',
    body: { password },
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export interface AdminPermissions {
  can_manage_users?: boolean;
  can_moderate_content?: boolean;
  can_view_ai_usage?: boolean;
  can_send_announcements?: boolean;
  can_export_data?: boolean;
}

export interface AdminTeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'super_admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  permissions: AdminPermissions;
  actionsCount: number;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

export interface AdminInviteItem {
  id: string;
  email: string;
  role: 'admin' | 'super_admin';
  permissions: AdminPermissions;
  expiresAt: string;
  createdAt: string;
}

export interface PlatformSettings {
  id: string;
  appName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceAllowlistJson: string[];
  featureChat: boolean;
  featureUploads: boolean;
  featureDocuments: boolean;
  featureSignups: boolean;
  featureGoogleLogin: boolean;
  dailyMessageLimit: number;
  maxUploadBytes: number;
  dailyUploadQuota: number;
  dailyCostAlertUsd: number;
  monthlyCostCapUsd: number;
  sessionLifetimeMinutes: number;
  minPasswordLength: number;
  requireEmailVerification: boolean;
  requireAdminOtp: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  aiModel: string;
  aiSystemPromptVersion: string;
  aiMaxTokens: number;
  currentVersion: number;
  allowedFileTypesJson: string[];
  updatedAt: string;
}

export interface PlatformSettingsVersion {
  id: string;
  version: number;
  changedById: string;
  reason: string | null;
  createdAt: string;
}

export function fetchStepUpStatus() {
  return request<{ verified: boolean }>('/super/step-up/status', {
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function requestStepUpOtp() {
  return request<{ sent: boolean }>('/super/step-up/request-otp', {
    method: 'POST',
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function verifyStepUp(body: { password?: string; code?: string }) {
  return request<{ verified: boolean }>('/super/step-up/verify', {
    method: 'POST',
    body,
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function fetchAdminTeam() {
  return request<{ members: AdminTeamMember[]; invites: AdminInviteItem[] }>('/super/team', {
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function inviteAdminMember(body: {
  email: string;
  role: 'admin' | 'super_admin';
  permissions?: AdminPermissions;
}) {
  return request<{ invite: { id: string; email: string; role: string; expiresAt: string } }>(
    '/super/team/invite',
    { method: 'POST', body, baseUrl: ADMIN_API_BASE_URL, cookie: true },
  );
}

export function revokeAdminInvite(inviteId: string) {
  return request<void>(`/super/invites/${inviteId}`, {
    method: 'DELETE',
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function updateAdminPermissions(
  userId: string,
  permissions: AdminPermissions,
  reason?: string,
) {
  return request<{ user: { id: string; email: string; role: string } }>(
    `/super/team/${userId}/permissions`,
    { method: 'PATCH', body: { permissions, reason }, baseUrl: ADMIN_API_BASE_URL, cookie: true },
  );
}

export function fetchPlatformSettings() {
  return request<{
    settings: PlatformSettings;
    versions: PlatformSettingsVersion[];
    monthlyAiSpendUsd: number;
    aiApiConfigured: boolean;
  }>('/super/settings', { baseUrl: ADMIN_API_BASE_URL, cookie: true });
}

export function updatePlatformSettings(body: Partial<PlatformSettings> & { reason?: string }) {
  return request<{ settings: PlatformSettings }>('/super/settings', {
    method: 'PATCH',
    body,
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function rollbackPlatformSettings(version: number, reason: string) {
  return request<{ settings: PlatformSettings }>('/super/settings/rollback', {
    method: 'POST',
    body: { version, reason },
    baseUrl: ADMIN_API_BASE_URL,
    cookie: true,
  });
}

export function acceptAdminInvite(body: { token: string; name?: string; password: string }) {
  return request<{ email: string; role: string }>('/auth/admin-invite/accept', {
    method: 'POST',
    body,
    auth: false,
  });
}

export interface AdminRecommendationsOverview {
  featureCourseRecommendations: boolean;
  dailyCourseSearchLimit: number;
  monthlySearchCostCapUsd: number;
  allowDomains: string[];
  blockDomains: string[];
  hardcodedDenyDomains: string[];
  monthlyUsage: {
    searchesThisMonth: number;
    jobsThisMonth: number;
    tokensIn: number;
    tokensOut: number;
    estimatedCostUsd: number;
    activeCacheEntries: number;
  };
  reports: Array<{
    id: string;
    recommendationId: string;
    title: string;
    recStatus: string;
    url: string;
    sourceDomain: string;
    reason: string;
    status: string;
    reporterEmail: string | null;
    createdAt: string;
  }>;
}

export function fetchAdminRecommendationsOverview() {
  return adminRequest<AdminRecommendationsOverview>('/recommendations/overview');
}

export function updateAdminRecommendationSettings(body: {
  featureCourseRecommendations?: boolean;
  dailyCourseSearchLimit?: number;
  monthlySearchCostCapUsd?: number;
  allowDomains?: string[];
  blockDomains?: string[];
}) {
  return adminRequest('/recommendations/settings', { method: 'PATCH', body });
}

export function resolveAdminRecommendationReport(
  id: string,
  action: 'dismiss' | 'mark_dead' | 'block_domain',
) {
  return adminRequest(`/recommendations/reports/${id}/resolve`, {
    method: 'POST',
    body: { action },
  });
}

export interface AdminCommunityOverview {
  stats: {
    totalPosts: number;
    totalReplies: number;
    activeGroups: number;
    openReports: number;
  };
  settings: {
    featureCommunity: boolean;
    bannedWords: string[];
    examNoticeEnabled: boolean;
    examNoticeMessage: string;
    pausedCourseSlugs: string[];
  };
  reports: Array<{
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    status: string;
    createdAt: string;
    reporter: { id: string; name: string; email: string } | null;
    targetUser: { id: string; name: string; email: string; status: string } | null;
  }>;
  flaggedPosts: Array<{
    id: string;
    title: string;
    flagReason: string | null;
    createdAt: string;
    community: { id: string; displayName: string };
    author: { id: string; name: string; email: string } | null;
  }>;
  communities: Array<{
    id: string;
    slug: string;
    displayName: string;
    universityName: string | null;
    isPaused: boolean;
  }>;
}

export function fetchAdminCommunityOverview() {
  return adminRequest<AdminCommunityOverview>('/community/overview');
}

export function resolveAdminCommunityReport(
  id: string,
  body: {
    action: 'dismiss' | 'hide' | 'delete' | 'warn' | 'mute' | 'suspend';
    reviewNote?: string;
    muteHours?: number;
  },
) {
  return adminRequest(`/community/reports/${id}/resolve`, { method: 'POST', body });
}

export function updateAdminCommunitySettings(body: {
  featureCommunity?: boolean;
  bannedWords?: string[];
  examNoticeEnabled?: boolean;
  examNoticeMessage?: string;
  pausedCourseSlugs?: string[];
}) {
  return adminRequest('/community/settings', { method: 'PATCH', body });
}

export interface AdminShsOverviewResponse {
  counts: {
    shsUsers: number;
    universityUsers: number;
    consentPending: number;
    consentGiven: number;
    consentWithdrawn: number;
    openFlagsCount: number;
  };
  settings: {
    featureShsSignups: boolean;
    featureShsCommunity: boolean;
    shsBannedWords: string[];
    shsSyllabusSource: string;
  };
  flags: Array<{
    id: string;
    source: string;
    direction: string;
    reason: string;
    excerpt: string;
    createdAt: string;
    user: { id: string; name: string; schoolYear: string | null } | null;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string | null;
    isCore: boolean;
    syllabusVersion: string;
    active: boolean;
    topics: Array<{ id: string; title: string; schoolYear: string | null }>;
  }>;
}

export function fetchAdminShsOverview() {
  return adminRequest<AdminShsOverviewResponse>('/shs/overview');
}

export function updateAdminShsSettings(body: {
  featureShsSignups?: boolean;
  featureShsCommunity?: boolean;
  shsBannedWords?: string[];
  shsSyllabusSource?: string;
}) {
  return adminRequest('/shs/settings', { method: 'PATCH', body });
}

export function resolveAdminShsFlag(flagId: string) {
  return adminRequest(`/shs/flags/${flagId}`, { method: 'PATCH' });
}

export function createAdminShsSubject(body: {
  name: string;
  code?: string | null;
  isCore: boolean;
  programmeSlugs?: string[];
  syllabusVersion?: string;
  sourceCitation?: string;
}) {
  return adminRequest('/shs/subjects', { method: 'POST', body });
}

export function toggleAdminShsSubject(subjectId: string, active: boolean) {
  return adminRequest(`/shs/subjects/${subjectId}`, { method: 'PATCH', body: { active } });
}

export function addAdminShsTopic(
  subjectId: string,
  body: { title: string; schoolYear?: string | null },
) {
  return adminRequest(`/shs/subjects/${subjectId}/topics`, { method: 'POST', body });
}

export interface AdminShsLessonsResponse {
  topics: Array<{
    id: string;
    title: string;
    strand: string | null;
    subStrand: string | null;
    referenceNotes: string | null;
    schoolYear: string | null;
    subjectId: string;
    subjectName: string;
    lesson: {
      id: string;
      status: 'draft' | 'reviewed' | 'approved';
      version: number;
      opensCount: number;
      generatedAt: string;
      contentJson: unknown;
    } | null;
    completedCount: number;
    avgTimeSeconds: number;
  }>;
  reports: Array<{
    id: string;
    reason: string;
    createdAt: string;
    user: { id: string; name: string };
    topic: { id: string; title: string };
  }>;
}

export function fetchAdminShsLessons(subjectId?: string) {
  const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
  return adminRequest<AdminShsLessonsResponse>(`/shs/lessons${qs}`);
}

export function updateAdminShsLesson(
  topicId: string,
  body: {
    status?: 'draft' | 'reviewed' | 'approved';
    contentJson?: unknown;
    referenceNotes?: string | null;
    strand?: string | null;
    subStrand?: string | null;
  },
) {
  return adminRequest(`/shs/lessons/${topicId}`, { method: 'PATCH', body });
}

export function regenerateAdminShsLesson(topicId: string) {
  return adminRequest(`/shs/lessons/${topicId}/regenerate`, { method: 'POST' });
}

export function bulkGenerateAdminShsLessons(subjectId: string) {
  return adminRequest<{ generated: number; remainingMissing: number }>(
    `/shs/subjects/${subjectId}/lessons/bulk-generate`,
    { method: 'POST' },
  );
}

export function resolveAdminShsLessonReport(
  reportId: string,
  status: 'dismissed' | 'warned' | 'suspended' = 'dismissed',
) {
  return adminRequest(`/shs/lesson-reports/${reportId}`, { method: 'PATCH', body: { status } });
}
