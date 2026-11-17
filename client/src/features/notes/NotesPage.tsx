import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FilePlus2, FolderPlus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, Textarea, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';

interface Course {
  id: string;
  name: string;
  color: string | null;
  noteCount: number;
}

interface Note {
  id: string;
  title: string;
  body: string;
  courseId: string | null;
  aiSummary: string | null;
  snippet?: string;
  createdAt: string;
  updatedAt: string;
}

export function NotesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [courseFilter, setCourseFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => request<Course[]>('/courses'),
  });

  const notesQuery = useQuery({
    queryKey: ['notes', search, courseFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (courseFilter) params.set('courseId', courseFilter);
      const qs = params.toString();
      return request<{ items: Note[]; nextCursor: string | null }>(`/notes${qs ? `?${qs}` : ''}`);
    },
  });

  const activeNote = notesQuery.data?.items.find((n) => n.id === activeNoteId) ?? null;

  useEffect(() => {
    const first = notesQuery.data?.items[0];
    if (!activeNoteId && first) {
      setActiveNoteId(first.id);
    }
  }, [activeNoteId, notesQuery.data]);

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setBody(activeNote.body);
      setCourseId(activeNote.courseId ?? '');
      setAiSummary(activeNote.aiSummary);
    }
  }, [activeNote?.id, activeNote?.updatedAt]);

  const handleCreateCourse = async () => {
    const trimmed = newCourseName.trim();
    if (!trimmed) return;
    try {
      await request<Course>('/courses', { method: 'POST', body: { name: trimmed } });
      setNewCourseName('');
      await qc.invalidateQueries({ queryKey: ['courses'] });
      toast.show({ kind: 'success', title: 'Course added' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create course',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleCreateNote = async () => {
    try {
      const created = await request<Note>('/notes', {
        method: 'POST',
        body: {
          title: 'Untitled note',
          body: '',
          courseId: courseFilter && courseFilter !== 'none' ? courseFilter : null,
        },
      });
      setActiveNoteId(created.id);
      setTitle(created.title);
      setBody(created.body);
      setCourseId(created.courseId ?? '');
      setAiSummary(null);
      await qc.invalidateQueries({ queryKey: ['notes'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create note',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleSaveNote = async () => {
    if (!activeNoteId || !title.trim()) return;
    setSaving(true);
    try {
      await request<Note>(`/notes/${activeNoteId}`, {
        method: 'PATCH',
        body: { title: title.trim(), body, courseId: courseId || null },
      });
      await qc.invalidateQueries({ queryKey: ['notes'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
      toast.show({ kind: 'success', title: 'Note saved' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!activeNoteId) return;
    try {
      await request<void>(`/notes/${activeNoteId}`, { method: 'DELETE' });
      setActiveNoteId(null);
      await qc.invalidateQueries({ queryKey: ['notes'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
      toast.show({ kind: 'info', title: 'Note deleted' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleSummarize = async () => {
    if (!activeNoteId) return;
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email to summarize notes with AI.',
      });
      return;
    }
    setSummarizing(true);
    try {
      await request<Note>(`/notes/${activeNoteId}`, {
        method: 'PATCH',
        body: { title: title.trim() || 'Untitled note', body, courseId: courseId || null },
      });
      const res = await request<{ summary: string }>(`/notes/${activeNoteId}/summarize`, {
        method: 'POST',
      });
      setAiSummary(res.summary);
      await qc.invalidateQueries({ queryKey: ['notes'] });
      toast.show({ kind: 'success', title: 'AI summary ready' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not summarize',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
      <div className="space-y-4">
        <Card className="p-4 space-y-4">
          <Button type="button" className="w-full" onClick={() => void handleCreateNote()}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            New note
          </Button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              aria-label="Search notes"
              className="w-full rounded-xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </div>

          <div className="space-y-1 pt-3 border-t border-line/80">
            <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
              Courses
            </p>
            <button
              type="button"
              onClick={() => setCourseFilter('')}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                courseFilter === ''
                  ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'text-fg/80 hover:bg-surface2'
              }`}
            >
              <span>All notes</span>
            </button>
            <button
              type="button"
              onClick={() => setCourseFilter('none')}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                courseFilter === 'none'
                  ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'text-fg/80 hover:bg-surface2'
              }`}
            >
              <span>Uncategorised</span>
            </button>
            {(coursesQuery.data ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourseFilter(c.id)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  courseFilter === c.id
                    ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                    : 'text-fg/80 hover:bg-surface2'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-muted">
                  {c.noteCount}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 pt-2 border-t border-line">
            <input
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="Add course..."
              aria-label="New course name"
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 py-1 text-sm focus:outline-none"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label="Create course"
              onClick={() => void handleCreateCourse()}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <Card className="p-2 max-h-80 overflow-y-auto space-y-1">
          {notesQuery.isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notesQuery.isError ? (
            <ErrorState title="Could not load notes" onRetry={() => void notesQuery.refetch()} />
          ) : (notesQuery.data?.items.length ?? 0) === 0 ? (
            <p className="p-4 text-center text-xs text-muted">No notes yet.</p>
          ) : (
            notesQuery.data!.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveNoteId(n.id)}
                className={`w-full rounded-lg p-2.5 text-left transition-colors ${
                  n.id === activeNoteId
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                    : 'hover:bg-surface2'
                }`}
              >
                <p className="truncate text-sm font-medium">{n.title}</p>
                {n.snippet ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.snippet}</p>
                ) : null}
              </button>
            ))
          )}
        </Card>
      </div>

      <div>
        {!activeNote ? (
          <Card className="p-10">
            <EmptyState
              icon={BookOpen}
              title="Select or create a note"
              description="Organize your lecture notes by course, search them anytime, and summarize them with AI."
              action={
                <Button type="button" onClick={() => void handleCreateNote()}>
                  Create your first note
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" loading={saving} onClick={() => void handleSaveNote()}>
                  Save note
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={summarizing}
                  onClick={() => void handleSummarize()}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Summarize with AI
                </Button>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => void handleDeleteNote()}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div>
                <label htmlFor="note-course" className="mb-1.5 block text-sm font-medium text-fg">
                  Course
                </label>
                <select
                  id="note-course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
                >
                  <option value="">Uncategorised</option>
                  {(coursesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Notes"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your lecture notes, formulas, or key ideas..."
            />

            {aiSummary ? (
              <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900/50 dark:bg-primary-950/20">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  AI Summary
                </p>
                <MarkdownContent content={aiSummary} />
              </div>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  );
}

