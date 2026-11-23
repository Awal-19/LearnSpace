import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createStudyGroup,
  fetchCommunityGroupsHub,
  joinGroupByInviteCode,
  joinStudyGroup,
} from './communityApi';
import { CommunityLayout } from './CommunityLayout';

export function CommunityGroupsHubPage() {
  const path = useAppPath();
  const exp = useExperience();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedCommunityId, setSelectedCommunityId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newCommunityId, setNewCommunityId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public_course' | 'invite_only'>(
    'public_course',
  );
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ['community', 'groups-hub', selectedCommunityId, search],
    queryFn: () =>
      fetchCommunityGroupsHub({
        communityId: selectedCommunityId || undefined,
        q: search.trim() || undefined,
      }),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!newCommunityId && query.data?.communities?.[0]?.id) {
      setNewCommunityId(query.data.communities[0].id);
    }
  }, [query.data, newCommunityId]);

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoiningCode(true);
    try {
      const res = await joinGroupByInviteCode(inviteCode.trim());
      toast.show({ kind: 'success', title: `Joined ${res.name}` });
      setInviteCode('');
      await qc.invalidateQueries({ queryKey: ['community'] });
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

  const handleJoinPublicGroup = async (groupId: string, name: string) => {
    setBusyGroupId(groupId);
    try {
      await joinStudyGroup(groupId);
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: `Joined ${name}` });
      navigate(path(`/community/groups/${groupId}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not join group',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyGroupId(null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommunityId) return;
    setCreating(true);
    try {
      const res = await createStudyGroup({
        communityId: newCommunityId,
        name: newName.trim(),
        description: newDesc.trim() || null,
        visibility: newVisibility,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      await qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ kind: 'success', title: 'Study group created!' });
      navigate(path(`/community/groups/${res.id}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create study group',
        description: err instanceof ApiError ? err.message : 'Please check your input.',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <CommunityLayout>
      <GlassCard className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-500" aria-hidden="true" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                Study Groups
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Collaborate with peers via real-time group chat, shared tasks, live focus timers, and
              study notes.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Study Group
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-52">
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter groups..."
                aria-label="Filter study groups"
                className="h-9 w-full rounded-xl border border-line bg-surface pl-8 pr-3 text-xs text-fg placeholder:text-muted focus:border-primary-400 focus:outline-none"
              />
            </div>

            {query.data?.communities.length ? (
              <select
                aria-label={`Filter by ${exp.labels.courseLower}`}
                value={selectedCommunityId}
                onChange={(e) => setSelectedCommunityId(e.target.value)}
                className="h-9 rounded-xl border border-line bg-surface px-3 text-xs text-fg"
              >
                <option value="">All {exp.labels.coursePlural}</option>
                {query.data.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <form onSubmit={handleJoinCode} className="flex items-center gap-2">
            <Input
              label="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste invite code..."
              aria-label="Study group invite code"
              className="h-9 w-40 text-xs"
            />
            <Button type="submit" size="sm" variant="secondary" loading={joiningCode}>
              Join by Code
            </Button>
          </form>
        </div>
      </GlassCard>

      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState
          title="Could not load Study Groups"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {/* My Study Groups */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-fg">
              My Study Groups ({query.data.myGroups.length})
            </h2>
            {query.data.myGroups.length === 0 ? (
              <Card className="p-5 text-xs text-muted">
                You haven&apos;t joined any study groups yet. Join one below or create your own!
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {query.data.myGroups.map((g) => (
                  <Link key={g.id} to={path(`/community/groups/${g.id}`)}>
                    <GlassCard className="h-full space-y-2 p-4 transition-all hover:-translate-y-0.5 hover:border-primary-300">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-fg">{g.name}</h3>
                        <Badge tone="neutral">{g.role}</Badge>
                      </div>
                      <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                        {g.communityName}
                      </p>
                      {g.description ? (
                        <p className="line-clamp-2 text-xs text-muted">{g.description}</p>
                      ) : null}
                      <div className="flex items-center gap-3 pt-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {g.memberCount} members
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          {g.messageCount} messages
                        </span>
                      </div>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Open / Discoverable Study Groups */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-fg">
              Open Study Groups to Join
            </h2>
            {query.data.discoverGroups.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={Users}
                  title="No open study groups waiting right now"
                  description="Start a new group for peer revision, past-paper walkthroughs, or focus sessions."
                  action={
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      Create Study Group
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {query.data.discoverGroups.map((g) => (
                  <GlassCard
                    key={g.id}
                    className="flex flex-col justify-between gap-3 p-4 transition-all hover:border-primary-300"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-fg">{g.name}</h3>
                        <Badge tone="primary">Public</Badge>
                      </div>
                      <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                        {g.communityName}
                      </p>
                      {g.description ? (
                        <p className="line-clamp-2 text-xs text-muted">{g.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between border-t border-line/60 pt-2.5 text-xs text-muted">
                      <span>
                        {g.memberCount} members · {g.messageCount} msgs
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        loading={busyGroupId === g.id}
                        onClick={() => void handleJoinPublicGroup(g.id, g.name)}
                      >
                        Join Group
                      </Button>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Create Study Group Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Study Group">
        <form onSubmit={handleCreateGroup} className="space-y-3">
          <div>
            <label htmlFor="group-community" className="mb-1 block text-xs font-medium text-muted">
              {exp.labels.courseSingular}
            </label>
            <select
              id="group-community"
              value={newCommunityId}
              onChange={(e) => setNewCommunityId(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              required
            >
              {(query.data?.communities ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={exp.isShs ? 'e.g. WASSCE Elective Maths Squad' : 'e.g. Calculus Revision'}
            required
          />

          <Textarea
            label="Description (optional)"
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What will your group focus on?"
          />

          <div>
            <label htmlFor="group-visibility" className="mb-1 block text-xs font-medium text-muted">
              Visibility
            </label>
            <select
              id="group-visibility"
              value={newVisibility}
              onChange={(e) => setNewVisibility(e.target.value as 'public_course' | 'invite_only')}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
            >
              <option value="public_course">Open to {exp.labels.courseLower} peers (Public)</option>
              <option value="invite_only">Invite code only (Private)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={creating}>
              Create Group
            </Button>
          </div>
        </form>
      </Modal>
    </CommunityLayout>
  );
}
