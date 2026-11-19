import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FilePlus2, FolderPlus, Layers, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Spinner,
  Textarea,
  useToast,
} from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';
import { CourseBadge } from '../courses/CourseBadge';
import { createCourse, listCourses, type CourseSummary } from '../courses/coursesApi';
import { DictationMicButton, DictationStatusBar } from '../dictation/DictationControls';
import { useDictation } from '../dictation/useDictation';
import { generateDeck } from '../study/studyApi';

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
  const { noteId: routeNoteId } = useParams<{ noteId?: string }>();
  const navigate = useNavigate();
  const appPath = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [courseFilter, setCourseFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(routeNoteId ?? null);
  const [newCourseName, setNewCourseName] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  const newCourseInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [makingDeck, setMakingDeck] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (routeNoteId) {
      setActiveNoteId(routeNoteId);
    }
  }, [routeNoteId]);

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => listCourses(),
  });

  const coursesMap = useMemo(
    () => new Map((coursesQuery.data ?? []).map((c) => [c.id, c])),
    [coursesQuery.data],
  );

  const notesQuery = useQuery({
    queryKey: ['notes', debouncedSearch, courseFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
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

  const syncedNoteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeNote) return;
    const key = `${activeNote.id}:${activeNote.updatedAt}`;
    if (syncedNoteKeyRef.current === key) return;
    syncedNoteKeyRef.current = key;
    setTitle(activeNote.title);
    setBody(activeNote.body);
    setCourseId(activeNote.courseId ?? '');
    setAiSummary(activeNote.aiSummary);
  }, [activeNote]);

  const handleCreateCourse = async (e?: FormEvent) => {
    e?.preventDefault();
    if (creatingCourse) return;
    const trimmed = newCourseName.trim();
    if (!trimmed) {
      setCourseError('Enter a course name.');
      return;
    }
    if (trimmed.length > 60) {
      setCourseError('Course name must be 60 characters or fewer.');
      return;
    }
    const existingList = coursesQuery.data ?? [];
    if (existingList.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setCourseError('A course with this name already exists.');
      return;
    }
    if (existingList.length >= 50) {
      setCourseError('Course limit (50) reached.');
      return;
    }

    setCourseError(null);
    setCreatingCourse(true);

    const prevCourses = qc.getQueryData<CourseSummary[]>(['courses']);
    const prevFilter = courseFilter;
    const tempId = `temp-${Date.now()}`;
    const optimisticCourse: CourseSummary = {
      id: tempId,
      name: trimmed,
      code: null,
      lecturer: null,
      creditHours: null,
      semester: null,
      level: null,
      color: '#2563EB',
      notes: null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      noteCount: 0,
      documentCount: 0,
      taskCount: 0,
      deckCount: 0,
      quizCount: 0,
      studySeconds: 0,
    };

    qc.setQueryData<CourseSummary[]>(['courses'], (old = []) => [...old, optimisticCourse]);
    setNewCourseName('');
    setCourseFilter(tempId);

    try {
      const created = await createCourse({ name: trimmed });
      qc.setQueryData<CourseSummary[]>(['courses'], (old = []) =>
        old.map((c) => (c.id === tempId ? created : c)),
      );
      setCourseFilter(created.id);
      await qc.invalidateQueries({ queryKey: ['courses'] });
      toast.show({ kind: 'success', dedupeKey: 'course-added', title: 'Course added' });
    } catch (err) {
      qc.setQueryData(['courses'], prevCourses);
      setCourseFilter(prevFilter);
      setNewCourseName(trimmed);
      const reason = err instanceof ApiError && err.status < 500 ? err.message : null;
      setCourseError(
        reason ? `Couldn't add course: ${reason}` : "Couldn't add course, please try again.",
      );
    } finally {
      setCreatingCourse(false);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => newCourseInputRef.current?.focus());
      }
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

  const handleMakeFlashcards = async () => {
    if (!activeNoteId) return;
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email to generate flashcards with AI.',
      });
      return;
    }
    setMakingDeck(true);
    try {
      await request<Note>(`/notes/${activeNoteId}`, {
        method: 'PATCH',
        body: { title: title.trim() || 'Untitled note', body, courseId: courseId || null },
      });
      const deck = await generateDeck({
        noteId: activeNoteId,
        courseId: courseId || null,
        count: 10,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['decks'] }),
        qc.invalidateQueries({ queryKey: ['decks', 'due-summary'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({ kind: 'success', title: 'Flashcard deck created' });
      navigate(appPath(`/study?tab=decks&deckId=${deck.id}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create flashcards',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setMakingDeck(false);
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

          <div className="relative flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes..."
                aria-label="Search notes"
                className="w-full rounded-xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-base text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none sm:text-sm"
              />
            </div>
            <SearchMicButton value={search} onChange={setSearch} />
          </div>

          <div className="space-y-1 pt-3 border-t border-line/80">
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Courses</p>
              <Link
                to={appPath('/courses')}
                className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                Manage
              </Link>
            </div>
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
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  courseFilter === c.id
                    ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                    : 'text-fg/80 hover:bg-surface2'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? '#2563EB' }}
                  />
                  <span className="truncate">{c.code ? `${c.code} · ${c.name}` : c.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-muted">
                  {c.noteCount}
                </span>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-line/80 space-y-1.5">
            <form onSubmit={(e) => void handleCreateCourse(e)} className="flex items-center gap-2">
              <input
                ref={newCourseInputRef}
                type="text"
                enterKeyHint="done"
                maxLength={60}
                value={newCourseName}
                onChange={(e) => {
                  setNewCourseName(e.target.value);
                  if (courseError) setCourseError(null);
                }}
                placeholder="Add course..."
                aria-label="New course name"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface2/50 px-3 py-2 text-base text-fg placeholder:text-muted transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none sm:text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!newCourseName.trim() || creatingCourse}
                aria-label="Add course"
                className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 rounded-xl p-0"
              >
                {creatingCourse ? (
                  <Spinner className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </form>
            {courseError ? (
              <p role="alert" className="px-1 text-xs font-medium text-danger">
                {courseError}
              </p>
            ) : null}
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
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  {n.courseId && coursesMap.has(n.courseId) ? (
                    <CourseBadge course={coursesMap.get(n.courseId)} />
                  ) : null}
                </div>
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
                <Button
                  type="button"
                  size="sm"
                  loading={saving}
                  onClick={() => void handleSaveNote()}
                >
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={makingDeck}
                  onClick={() => void handleMakeFlashcards()}
                >
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  Make flashcards from this
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void handleDeleteNote()}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div>
                <label htmlFor="note-course" className="mb-1.5 block text-sm font-medium text-fg">
                  Course
                </label>
                <select
                  id="note-course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-base text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none sm:text-sm"
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

            <NoteDictationTextarea
              body={body}
              onChange={setBody}
              vocabularyHints={(coursesQuery.data ?? []).map((c) => c.name)}
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

function SearchMicButton({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const dictation = useDictation({ value, onChange });
  return <DictationMicButton dictation={dictation} compact />;
}

function NoteDictationTextarea({
  body,
  onChange,
  vocabularyHints,
}: {
  body: string;
  onChange: (next: string) => void;
  vocabularyHints: string[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation({
    value: body,
    onChange,
    inputRef: textareaRef,
    vocabularyHints,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <DictationMicButton dictation={dictation} compact />
      </div>
      <DictationStatusBar dictation={dictation} showSettingsToggle={false} />
      <Textarea
        ref={textareaRef}
        label="Notes"
        rows={14}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your lecture notes, formulas, or key ideas..."
      />
    </div>
  );
}
