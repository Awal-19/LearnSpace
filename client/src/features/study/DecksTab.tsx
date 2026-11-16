import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Layers, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

interface DeckSummary {
  id: string;
  title: string;
  topic: string | null;
  cardCount: number;
}

interface CardItem {
  id: string;
  front: string;
  back: string;
  position: number;
}

interface DeckDetail extends DeckSummary {
  cards: CardItem[];
}

interface NoteOption {
  id: string;
  title: string;
}

export function DecksTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [sourceMode, setSourceMode] = useState<'topic' | 'note'>('topic');
  const [topic, setTopic] = useState('');
  const [noteId, setNoteId] = useState('');
  const [count, setCount] = useState('10');
  const [generating, setGenerating] = useState(false);

  const [manualTitle, setManualTitle] = useState('');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');

  const decksQuery = useQuery({
    queryKey: ['decks'],
    queryFn: () => request<{ items: DeckSummary[] }>('/decks'),
  });

  const notesQuery = useQuery({
    queryKey: ['notes', 'for-study'],
    queryFn: () => request<{ items: NoteOption[] }>('/notes?limit=50'),
  });

  const deckQuery = useQuery({
    queryKey: ['deck', activeDeckId],
    queryFn: () => request<DeckDetail>(`/decks/${activeDeckId}`),
    enabled: Boolean(activeDeckId),
  });

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
      const created = await request<DeckDetail>('/decks/generate', {
        method: 'POST',
        body: {
          ...(sourceMode === 'topic' ? { topic: topic.trim() } : { noteId }),
          count: Number(count) || 10,
        },
      });
      setTopic('');
      setActiveDeckId(created.id);
      setCardIndex(0);
      setFlipped(false);
      await qc.invalidateQueries({ queryKey: ['decks'] });
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
      const created = await request<DeckDetail>('/decks', {
        method: 'POST',
        body: { title: manualTitle.trim() },
      });
      setManualTitle('');
      setActiveDeckId(created.id);
      setCardIndex(0);
      setFlipped(false);
      await qc.invalidateQueries({ queryKey: ['decks'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not create deck',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeDeckId || !newFront.trim() || !newBack.trim()) return;
    await request(`/decks/${activeDeckId}/cards`, {
      method: 'POST',
      body: { front: newFront.trim(), back: newBack.trim() },
    });
    setNewFront('');
    setNewBack('');
    await qc.invalidateQueries({ queryKey: ['deck', activeDeckId] });
    await qc.invalidateQueries({ queryKey: ['decks'] });
  };

  const handleDeleteDeck = async (id: string) => {
    await request<void>(`/decks/${id}`, { method: 'DELETE' });
    if (activeDeckId === id) setActiveDeckId(null);
    await qc.invalidateQueries({ queryKey: ['decks'] });
  };

  const cards = deckQuery.data?.cards ?? [];
  const currentCard = cards[cardIndex];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" />
            Generate with AI
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceMode('topic')}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${
                sourceMode === 'topic' ? 'bg-primary-600 text-white' : 'bg-surface2 text-muted'
              }`}
            >
              From topic
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('note')}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${
                sourceMode === 'note' ? 'bg-primary-600 text-white' : 'bg-surface2 text-muted'
              }`}
            >
              From note
            </button>
          </div>
          <form onSubmit={handleGenerate} className="space-y-2.5">
            {sourceMode === 'topic' ? (
              <Input
                label="Topic"
                placeholder="e.g. Photosynthesis"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            ) : (
              <div>
                <label htmlFor="deck-note" className="mb-1 block text-xs font-medium text-fg">
                  Select note
                </label>
                <select
                  id="deck-note"
                  value={noteId}
                  onChange={(e) => setNoteId(e.target.value)}
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
            )}
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
              disabled={sourceMode === 'topic' ? !topic.trim() : !noteId}
            >
              Generate flashcards
            </Button>
          </form>
        </Card>

        <Card className="p-4 space-y-3">
          <form onSubmit={handleCreateManual} className="flex gap-2">
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
          </form>

          <div className="space-y-1 max-h-72 overflow-y-auto">
            {decksQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : decksQuery.isError ? (
              <ErrorState title="Could not load decks" onRetry={() => void decksQuery.refetch()} />
            ) : (decksQuery.data?.items.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No decks yet.</p>
            ) : (
              decksQuery.data!.items.map((d) => (
                <div
                  key={d.id}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm ${
                    d.id === activeDeckId ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'hover:bg-surface2'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDeckId(d.id);
                      setCardIndex(0);
                      setFlipped(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                  >
                    {d.title}{' '}
                    <span className="text-xs font-normal text-muted">({d.cardCount})</span>
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
        {!activeDeckId ? (
          <Card className="p-10">
            <EmptyState
              icon={Layers}
              title="Pick or generate a deck"
              description="Generate flashcards from your notes or a topic, then flip through them here."
            />
          </Card>
        ) : deckQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !deckQuery.data ? (
          <ErrorState title="Could not load deck" onRetry={() => void deckQuery.refetch()} />
        ) : (
          <div className="space-y-5">
            <Card className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-fg">{deckQuery.data.title}</h2>
                {cards.length > 0 ? (
                  <span className="text-sm text-muted">
                    Card {cardIndex + 1} of {cards.length}
                  </span>
                ) : null}
              </div>

              {currentCard ? (
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  aria-label="Flip flashcard"
                  className="flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-line bg-bg p-6 text-center shadow-sm transition-colors hover:border-primary-400"
                >
                  <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-600">
                    {flipped ? 'Answer' : 'Question'}
                  </span>
                  <p className="text-base font-medium text-fg">
                    {flipped ? currentCard.back : currentCard.front}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs text-muted">
                    <RotateCw className="h-3.5 w-3.5" />
                    Click to flip
                  </span>
                </button>
              ) : (
                <p className="py-8 text-center text-sm text-muted">
                  This deck has no cards yet. Add one below!
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
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" size="sm" variant="secondary">
                    Add card
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

