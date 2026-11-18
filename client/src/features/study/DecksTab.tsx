import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Flame,
  ImagePlus,
  Layers,
  Play,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { prepareImageForUpload } from '../chat/imagePrep';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import { listCourses } from '../courses/coursesApi';
import { listDocuments } from '../documents/documentsApi';
import { AuthenticatedCardImage } from './AuthenticatedCardImage';
import { CsvImportModal } from './CsvImportModal';
import { FlashcardReviewMode } from './FlashcardReviewMode';
import {
  createCard,
  createDeck,
  deleteCard,
  deleteCardImage,
  deleteDeck,
  generateDeck,
  getDeck,
  getDueCards,
  getDueSummary,
  listDecks,
  updateCard,
  updateDeck,
  uploadCardImage,
  type CardItem,
  type DeckSummary,
} from './studyApi';

interface NoteOption {
  id: string;
  title: string;
  courseId?: string | null;
}

interface ReviewSessionState {
  mode: 'due' | 'all';
  deck: DeckSummary;
  cards: CardItem[];
}

function formatDueBadge(card: CardItem): {
  label: string;
  tone: 'neutral' | 'primary' | 'success' | 'warning';
} {
  if (card.mastered) return { label: 'Mastered', tone: 'success' };
  const dueMs = Date.parse(card.dueAt);
  if (!Number.isFinite(dueMs) || dueMs <= Date.now()) {
    return { label: 'Due now', tone: 'warning' };
  }
  const diffDays = Math.max(1, Math.ceil((dueMs - Date.now()) / (24 * 60 * 60 * 1000)));
  return { label: `Due in ${diffDays}d`, tone: 'neutral' };
}

export function DecksTab({ initialDeckId = null }: { initialDeckId?: string | null }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [activeDeckId, setActiveDeckId] = useState<string | null>(initialDeckId);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewSession, setReviewSession] = useState<ReviewSessionState | null>(null);
  const [startingReview, setStartingReview] = useState(false);

  const [courseFilter, setCourseFilter] = useState('');
  const [sourceMode, setSourceMode] = useState<'topic' | 'note' | 'document'>('topic');
  const [topic, setTopic] = useState('');
  const [noteId, setNoteId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [genCourseId, setGenCourseId] = useState('');
  const [count, setCount] = useState('10');
  const [generating, setGenerating] = useState(false);

  const [manualTitle, setManualTitle] = useState('');
  const [manualCourseId, setManualCourseId] = useState('');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newTopic, setNewTopic] = useState('');

  const [csvOpen, setCsvOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);

  const imageTargetCardRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialDeckId) {
      setActiveDeckId(initialDeckId);
      setCardIndex(0);
      setFlipped(false);
      setReviewSession(null);
    }
  }, [initialDeckId]);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const decksQuery = useQuery({
    queryKey: ['decks', courseFilter],
    queryFn: () => listDecks(courseFilter || undefined),
  });

  const dueSummaryQuery = useQuery({
    queryKey: ['decks', 'due-summary'],
    queryFn: () =>
      getDueSummary().catch(() => ({
        dueTodayCount: 0,
        reviewedTodayCount: 0,
        streakDays: 0,
        decks: [],
      })),
  });

  const notesQuery = useQuery({
    queryKey: ['notes', 'for-study'],
    queryFn: () => request<{ items: NoteOption[] }>('/notes?limit=50').catch(() => ({ items: [] })),
  });

  const docsQuery = useQuery({
    queryKey: ['documents', 'for-study'],
    queryFn: () =>
      listDocuments({ pageSize: 50 }).catch(() => ({
        documents: [],
        total: 0,
        page: 1,
        pageSize: 50,
      })),
  });
  const readyDocuments = useMemo(
    () => (docsQuery.data?.documents ?? []).filter((d) => d.status === 'ready'),
    [docsQuery.data],
  );

  const deckQuery = useQuery({
    queryKey: ['deck', activeDeckId],
    queryFn: () => getDeck(activeDeckId!),
    enabled: Boolean(activeDeckId),
  });

  const invalidateDeckQueries = async (deckId?: string | null) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['decks'] }),
      qc.invalidateQueries({ queryKey: ['decks', 'due-summary'] }),
      qc.invalidateQueries({ queryKey: ['courses'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ...(deckId ? [qc.invalidateQueries({ queryKey: ['deck', deckId] })] : []),
    ]);
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email to generate flashcards with AI.',
      });
      return;
    }
    setGenerating(true);
    try {
      const created = await generateDeck({
        ...(sourceMode === 'topic'
          ? { topic: topic.trim() }
          : sourceMode === 'note'
            ? { noteId }
            : { documentId }),
        count: Number(count) || 10,
        courseId: genCourseId || null,
      });
      setTopic('');
      setGenCourseId('');
      setActiveDeckId(created.id);
      setCardIndex(0);
      setFlipped(false);
      setReviewSession(null);
      await invalidateDeckQueries(created.id);
      toast.show({ kind: 'success', title: 'Flashcard deck generated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Generation failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateManual = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    try {
      const created = await createDeck({
        title: manualTitle.trim(),
        courseId: manualCourseId || null,
      });
      setManualTitle('');
      setManualCourseId('');
      setActiveDeckId(created.id);
      setCardIndex(0);
      setFlipped(false);
      setReviewSession(null);
      await invalidateDeckQueries(created.id);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create deck',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleUpdateDeckCourse = async (deckId: string, nextCourseId: string) => {
    try {
      await updateDeck(deckId, { courseId: nextCourseId || null });
      await invalidateDeckQueries(deckId);
      toast.show({ kind: 'success', title: 'Deck course updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update deck',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeDeckId || !newFront.trim() || !newBack.trim()) return;
    try {
      await createCard(activeDeckId, {
        front: newFront.trim(),
        back: newBack.trim(),
        topic: newTopic.trim() || null,
      });
      setNewFront('');
      setNewBack('');
      setNewTopic('');
      await invalidateDeckQueries(activeDeckId);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not add card',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleSaveCardEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCardId || !editFront.trim() || !editBack.trim()) return;
    try {
      await updateCard(editingCardId, {
        front: editFront.trim(),
        back: editBack.trim(),
        topic: editTopic.trim() || null,
      });
      setEditingCardId(null);
      await invalidateDeckQueries(activeDeckId);
      toast.show({ kind: 'success', title: 'Flashcard updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update card',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!activeDeckId) return;
    try {
      await deleteCard(cardId);
      setCardIndex((i) =>
        Math.max(0, Math.min(i, Math.max(0, (deckQuery.data?.cards.length ?? 1) - 2))),
      );
      await invalidateDeckQueries(activeDeckId);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not delete card',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleDeleteDeck = async (id: string) => {
    await deleteDeck(id);
    if (activeDeckId === id) {
      setActiveDeckId(null);
      setReviewSession(null);
    }
    await invalidateDeckQueries();
  };

  const startReview = async (deckId: string, mode: 'due' | 'all') => {
    setStartingReview(true);
    try {
      if (mode === 'due') {
        const res = await getDueCards(deckId);
        if (res.cards.length === 0) {
          toast.show({
            kind: 'success',
            title: 'No cards due right now',
            description: 'Use "Practice all" if you want an extra round.',
          });
          return;
        }
        setActiveDeckId(deckId);
        setReviewSession({ mode: 'due', deck: res.deck, cards: res.cards });
      } else {
        const detail =
          deckQuery.data && deckQuery.data.id === deckId ? deckQuery.data : await getDeck(deckId);
        if (detail.cards.length === 0) return;
        setActiveDeckId(deckId);
        setReviewSession({ mode: 'all', deck: detail, cards: detail.cards });
      }
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not start review',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setStartingReview(false);
    }
  };

  const handleCardImageChosen = async (file: File | undefined) => {
    const cardId = imageTargetCardRef.current;
    imageTargetCardRef.current = null;
    if (!file || !cardId) return;
    setUploadingImageFor(cardId);
    try {
      const prepared = await prepareImageForUpload(file);
      await uploadCardImage(cardId, prepared);
      await invalidateDeckQueries(activeDeckId);
      toast.show({ kind: 'success', title: 'Card image attached' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Image upload failed',
        description:
          err instanceof ApiError ? err.message : 'Choose a PNG, JPG, or WebP under 5 MB.',
      });
    } finally {
      setUploadingImageFor(null);
    }
  };

  const handleRemoveCardImage = async (cardId: string) => {
    try {
      await deleteCardImage(cardId);
      await invalidateDeckQueries(activeDeckId);
      toast.show({ kind: 'success', title: 'Card image removed' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not remove image',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const cards = deckQuery.data?.cards ?? [];
  const currentCard = cards[cardIndex];
  const dueSummary = dueSummaryQuery.data;
  const firstDueDeck = dueSummary?.decks[0];

  const genDisabled =
    sourceMode === 'topic' ? !topic.trim() : sourceMode === 'note' ? !noteId : !documentId;

  return (
    <div className="space-y-5">
      {dueSummary && dueSummary.dueTodayCount > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary-200/80 bg-primary-50/60 px-4 py-3.5 dark:border-primary-500/30 dark:bg-primary-500/10">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="primary">{dueSummary.dueTodayCount} due today</Badge>
            <span className="text-sm font-medium text-fg">
              {dueSummary.reviewedTodayCount} reviewed today
            </span>
            {dueSummary.streakDays > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                {dueSummary.streakDays}d review streak
              </span>
            ) : null}
          </div>
          {firstDueDeck ? (
            <Button
              type="button"
              size="sm"
              loading={startingReview}
              onClick={() => void startReview(firstDueDeck.deckId, 'due')}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Review {firstDueDeck.title} ({firstDueDeck.dueCount})
            </Button>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[310px_1fr]">
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" />
              Generate with AI
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'topic', label: 'Topic' },
                  { id: 'note', label: 'Note' },
                  { id: 'document', label: 'Document' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSourceMode(m.id)}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                    sourceMode === m.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface2 text-muted hover:text-fg'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <form onSubmit={handleGenerate} className="space-y-2.5">
              {sourceMode === 'topic' ? (
                <Input
                  label="Topic"
                  placeholder="e.g. Photosynthesis"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              ) : sourceMode === 'note' ? (
                <div>
                  <label htmlFor="deck-note" className="mb-1 block text-xs font-medium text-fg">
                    Select note
                  </label>
                  <select
                    id="deck-note"
                    value={noteId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setNoteId(nextId);
                      const picked = (notesQuery.data?.items ?? []).find((n) => n.id === nextId);
                      if (picked?.courseId) setGenCourseId(picked.courseId);
                    }}
                    className="h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
                  >
                    <option value="">Choose a note...</option>
                    {(notesQuery.data?.items ?? []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="deck-doc" className="mb-1 block text-xs font-medium text-fg">
                    Select ready document
                  </label>
                  <select
                    id="deck-doc"
                    value={documentId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setDocumentId(nextId);
                      const picked = readyDocuments.find((d) => d.id === nextId);
                      if (picked?.courseId) setGenCourseId(picked.courseId);
                    }}
                    className="h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
                  >
                    <option value="">Choose a document...</option>
                    {readyDocuments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="deck-gen-course" className="mb-1 block text-xs font-medium text-fg">
                  Course (optional)
                </label>
                <CourseSelect
                  id="deck-gen-course"
                  ariaLabel="Course for generated deck"
                  mode="assign"
                  value={genCourseId}
                  onChange={setGenCourseId}
                  courses={courses}
                  className="h-9 w-full text-xs"
                />
              </div>
              <Input
                label="Cards (5–30)"
                type="number"
                min={5}
                max={30}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                loading={generating}
                disabled={genDisabled}
              >
                Make flashcards from this
              </Button>
            </form>
          </Card>

          <Card className="p-4 space-y-3">
            <form onSubmit={handleCreateManual} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="New manual deck..."
                  aria-label="New manual deck title"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm focus:outline-none"
                />
                <Button type="submit" size="sm" variant="secondary" aria-label="Create deck">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <CourseSelect
                ariaLabel="Course for manual deck"
                mode="assign"
                value={manualCourseId}
                onChange={setManualCourseId}
                courses={courses}
                className="h-8 w-full text-xs"
              />
            </form>

            <CourseSelect
              ariaLabel="Filter decks by course"
              mode="filter"
              value={courseFilter}
              onChange={setCourseFilter}
              courses={courses}
              className="h-8 w-full text-xs"
            />

            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {decksQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : decksQuery.isError ? (
                <ErrorState
                  title="Could not load decks"
                  onRetry={() => void decksQuery.refetch()}
                />
              ) : (decksQuery.data?.items.length ?? 0) === 0 ? (
                <p className="py-4 text-center text-xs text-muted">No decks yet.</p>
              ) : (
                decksQuery.data!.items.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm ${
                      d.id === activeDeckId
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                        : 'hover:bg-surface2'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDeckId(d.id);
                        setCardIndex(0);
                        setFlipped(false);
                        setReviewSession(null);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="truncate font-medium">
                          {d.title}{' '}
                          <span className="text-xs font-normal text-muted">({d.cardCount})</span>
                        </p>
                        {d.dueCount > 0 ? <Badge tone="warning">{d.dueCount} due</Badge> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {d.courseId ? <CourseBadge course={courseById.get(d.courseId)} /> : null}
                        {d.accuracy !== null ? <span>{d.accuracy}% accuracy</span> : null}
                        {d.masteredCount > 0 ? (
                          <span>
                            {d.masteredCount}/{d.cardCount} mastered
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${d.title}`}
                      onClick={() => void handleDeleteDeck(d.id)}
                      className="rounded p-1 text-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div>
          {reviewSession ? (
            <FlashcardReviewMode
              deck={reviewSession.deck}
              initialCards={reviewSession.cards}
              mode={reviewSession.mode}
              onExit={() => setReviewSession(null)}
              onSessionUpdated={() => invalidateDeckQueries(reviewSession.deck.id)}
            />
          ) : !activeDeckId ? (
            <Card className="p-10">
              <EmptyState
                icon={Layers}
                title="Pick or generate a deck"
                description="Generate flashcards from your notes, documents, or a topic, then review them using spaced repetition."
              />
            </Card>
          ) : deckQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !deckQuery.data ? (
            <ErrorState title="Could not load deck" onRetry={() => void deckQuery.refetch()} />
          ) : (
            <div className="space-y-5">
              <Card className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-fg">{deckQuery.data.title}</h2>
                      {deckQuery.data.courseId ? (
                        <CourseBadge course={courseById.get(deckQuery.data.courseId)} link />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CourseSelect
                        ariaLabel="Assign deck to course"
                        mode="assign"
                        value={deckQuery.data.courseId ?? ''}
                        onChange={(val) => void handleUpdateDeckCourse(deckQuery.data.id, val)}
                        courses={courses}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      loading={startingReview}
                      disabled={deckQuery.data.dueCount === 0}
                      onClick={() => void startReview(deckQuery.data.id, 'due')}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Review due ({deckQuery.data.dueCount})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={startingReview}
                      disabled={cards.length === 0}
                      onClick={() => void startReview(deckQuery.data.id, 'all')}
                    >
                      Practice all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCsvOpen(true)}
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      Import CSV
                    </Button>
                  </div>
                </div>

                {/* Per-Deck Stats Strip */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-line bg-surface2/45 px-3 py-2">
                    <p className="text-[11px] text-muted">Due now</p>
                    <p className="text-base font-bold text-fg tabular-nums">
                      {deckQuery.data.dueCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface2/45 px-3 py-2">
                    <p className="text-[11px] text-muted">Mastered</p>
                    <p className="text-base font-bold text-fg tabular-nums">
                      {deckQuery.data.masteredCount}/{deckQuery.data.cardCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface2/45 px-3 py-2">
                    <p className="text-[11px] text-muted">Accuracy</p>
                    <p className="text-base font-bold text-fg tabular-nums">
                      {deckQuery.data.accuracy !== null ? `${deckQuery.data.accuracy}%` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface2/45 px-3 py-2">
                    <p className="text-[11px] text-muted">Streak</p>
                    <p className="inline-flex items-center gap-1 text-base font-bold text-fg tabular-nums">
                      <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      {deckQuery.data.streakDays}d
                    </p>
                  </div>
                </div>

                {currentCard ? (
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    aria-label="Flip flashcard"
                    className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-bg p-6 text-center shadow-sm transition-colors hover:border-primary-400"
                  >
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                        {flipped ? 'Answer' : 'Question'}
                      </span>
                      {currentCard.topic ? <Badge tone="neutral">{currentCard.topic}</Badge> : null}
                    </div>
                    {currentCard.imageUrl ? (
                      <AuthenticatedCardImage
                        src={currentCard.imageUrl}
                        alt={currentCard.front}
                        className="max-h-40 rounded-xl border border-line object-contain"
                      />
                    ) : null}
                    <p className="text-base font-medium text-fg">
                      {flipped ? currentCard.back : currentCard.front}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <RotateCw className="h-3.5 w-3.5" />
                      Click to flip ({cardIndex + 1} of {cards.length})
                    </span>
                  </button>
                ) : (
                  <p className="py-8 text-center text-sm text-muted">
                    This deck has no cards yet. Add cards below or import a CSV!
                  </p>
                )}

                {cards.length > 1 ? (
                  <div className="flex justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={cardIndex === 0}
                      onClick={() => {
                        setCardIndex((i) => Math.max(0, i - 1));
                        setFlipped(false);
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={cardIndex >= cards.length - 1}
                      onClick={() => {
                        setCardIndex((i) => Math.min(cards.length - 1, i + 1));
                        setFlipped(false);
                      }}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-semibold text-fg">Add card</h3>
                <form onSubmit={handleAddCard} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Front"
                    value={newFront}
                    onChange={(e) => setNewFront(e.target.value)}
                  />
                  <Input
                    label="Back"
                    value={newBack}
                    onChange={(e) => setNewBack(e.target.value)}
                  />
                  <Input
                    label="Topic (optional)"
                    placeholder="e.g. Recursion"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                  />
                  <div className="flex items-end justify-end">
                    <Button type="submit" size="sm" variant="secondary">
                      Add card
                    </Button>
                  </div>
                </form>
              </Card>

              {cards.length > 0 ? (
                <Card className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-fg">Cards in deck ({cards.length})</h3>
                  <div className="divide-y divide-line">
                    {cards.map((c) => {
                      const dueBadge = formatDueBadge(c);
                      const isEditing = editingCardId === c.id;
                      return (
                        <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                          {isEditing ? (
                            <form
                              onSubmit={handleSaveCardEdit}
                              className="grid gap-2.5 sm:grid-cols-2"
                            >
                              <Input
                                label="Front"
                                value={editFront}
                                onChange={(e) => setEditFront(e.target.value)}
                              />
                              <Input
                                label="Back"
                                value={editBack}
                                onChange={(e) => setEditBack(e.target.value)}
                              />
                              <Input
                                label="Topic"
                                value={editTopic}
                                onChange={(e) => setEditTopic(e.target.value)}
                              />
                              <div className="flex items-end justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingCardId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button type="submit" size="sm">
                                  Save
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge tone={dueBadge.tone}>{dueBadge.label}</Badge>
                                  {c.topic ? <Badge tone="neutral">{c.topic}</Badge> : null}
                                  {c.accuracy !== null ? (
                                    <span className="text-[11px] text-muted">
                                      {c.accuracy}% ({c.reviewCount} review
                                      {c.reviewCount === 1 ? '' : 's'})
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-sm font-medium text-fg">{c.front}</p>
                                <p className="text-xs text-muted">{c.back}</p>
                                {c.imageUrl ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <AuthenticatedCardImage
                                      src={c.imageUrl}
                                      alt={c.front}
                                      className="h-16 w-24 rounded-lg border border-line object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveCardImage(c.id)}
                                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                                    >
                                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                                      Remove image
                                    </button>
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Attach image to ${c.front}`}
                                  loading={uploadingImageFor === c.id}
                                  onClick={() => {
                                    imageTargetCardRef.current = c.id;
                                    imageInputRef.current?.click();
                                  }}
                                >
                                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Edit ${c.front}`}
                                  onClick={() => {
                                    setEditingCardId(c.id);
                                    setEditFront(c.front);
                                    setEditBack(c.back);
                                    setEditTopic(c.topic ?? '');
                                  }}
                                >
                                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Delete ${c.front}`}
                                  onClick={() => void handleDeleteCard(c.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ) : null}

              <CsvImportModal
                open={csvOpen}
                deckId={deckQuery.data.id}
                deckTitle={deckQuery.data.title}
                onClose={() => setCsvOpen(false)}
                onImported={() => invalidateDeckQueries(deckQuery.data.id)}
              />
            </div>
          )}
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload card image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleCardImageChosen(file);
        }}
      />
    </div>
  );
}
