import { CheckCircle2, Flame, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { Badge, Button, Card, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { AuthenticatedCardImage } from './AuthenticatedCardImage';
import { reviewCard, type CardItem, type DeckSummary, type ReviewRating } from './studyApi';

interface FlashcardReviewModeProps {
  deck: DeckSummary;
  initialCards: CardItem[];
  mode: 'due' | 'all';
  onExit: () => void;
  onSessionUpdated: () => Promise<void>;
}

const RATING_OPTIONS: Array<{
  rating: ReviewRating;
  label: string;
  shortcut: string;
  toneClass: string;
}> = [
  {
    rating: 'again',
    label: 'Again',
    shortcut: '1',
    toneClass:
      'border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20',
  },
  {
    rating: 'hard',
    label: 'Hard',
    shortcut: '2',
    toneClass:
      'border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20',
  },
  {
    rating: 'good',
    label: 'Good',
    shortcut: '3',
    toneClass:
      'border-primary-200 bg-primary-50/70 text-primary-700 hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300 dark:hover:bg-primary-500/25',
  },
  {
    rating: 'easy',
    label: 'Easy',
    shortcut: '4',
    toneClass:
      'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20',
  },
];

export function FlashcardReviewMode({
  deck,
  initialCards,
  mode,
  onExit,
  onSessionUpdated,
}: FlashcardReviewModeProps) {
  const toast = useToast();
  const [queue, setQueue] = useState<CardItem[]>(initialCards);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [tallies, setTallies] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentCard = queue[0] ?? null;
  const totalSessionTarget = reviewedCount + queue.length;

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentCard || submitting) return;
      setSubmitting(true);
      try {
        await reviewCard(currentCard.id, rating);
        setTallies((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
        setReviewedCount((c) => c + 1);
        setQueue((prev) => prev.slice(1));
        setFlipped(false);
        void onSessionUpdated();
      } catch (err) {
        toast.show({
          kind: 'error',
          title: 'Could not save review',
          description: err instanceof ApiError ? err.message : 'Please try again.',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [currentCard, onSessionUpdated, submitting, toast],
  );

  // Desktop keyboard shortcuts: Space/Enter flip, 1..4 rate when flipped
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!currentCard || submitting) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }

      if (!flipped) return;
      if (e.key === '1') {
        e.preventDefault();
        void handleRate('again');
      } else if (e.key === '2') {
        e.preventDefault();
        void handleRate('hard');
      } else if (e.key === '3') {
        e.preventDefault();
        void handleRate('good');
      } else if (e.key === '4') {
        e.preventDefault();
        void handleRate('easy');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentCard, flipped, handleRate, submitting]);

  const handleTouchStart = (e: TouchEvent<HTMLButtonElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || !currentCard || submitting) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return;

    if (!flipped) {
      setFlipped(true);
      return;
    }
    if (dx > 0) {
      void handleRate('good');
    } else {
      void handleRate('again');
    }
  };

  if (!currentCard) {
    const recalledCount = tallies.hard + tallies.good + tallies.easy;
    const sessionAccuracy =
      reviewedCount > 0 ? Math.round((recalledCount / reviewedCount) * 100) : null;

    return (
      <Card className="p-6 sm:p-8 text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-fg">Review session complete</h2>
          <p className="text-sm text-muted">
            You completed {reviewedCount} card{reviewedCount === 1 ? '' : 's'} in{' '}
            <span className="font-medium text-fg">{deck.title}</span>.
          </p>
        </div>

        <div className="mx-auto grid max-w-md grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-line bg-surface2/50 p-3">
            <p className="text-[11px] text-muted">Reviewed</p>
            <p className="mt-0.5 text-lg font-bold text-fg tabular-nums">{reviewedCount}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface2/50 p-3">
            <p className="text-[11px] text-muted">Session accuracy</p>
            <p className="mt-0.5 text-lg font-bold text-fg tabular-nums">
              {sessionAccuracy !== null ? `${sessionAccuracy}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface2/50 p-3">
            <p className="text-[11px] text-muted">Deck streak</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-lg font-bold text-fg tabular-nums">
              <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {Math.max(deck.streakDays, reviewedCount > 0 ? 1 : 0)}d
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2.5">
          {initialCards.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setQueue(initialCards);
                setReviewedCount(0);
                setTallies({ again: 0, hard: 0, good: 0, easy: 0 });
                setFlipped(false);
              }}
            >
              Review batch again
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onExit}>
            Back to deck
          </Button>
        </div>
      </Card>
    );
  }

  const progressPct =
    totalSessionTarget > 0 ? Math.round((reviewedCount / totalSessionTarget) * 100) : 0;

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">
              {mode === 'due' ? 'Due queue (SM-2)' : 'Practice all cards'}
            </Badge>
            <span className="text-xs text-muted tabular-nums">
              {queue.length} remaining · {reviewedCount} done
            </span>
          </div>
          <h2 className="font-display text-lg font-bold text-fg">{deck.title}</h2>
        </div>

        <Button type="button" size="sm" variant="secondary" onClick={onExit}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Exit review
        </Button>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full rounded-full bg-primary-600 transition-all duration-base"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-label={flipped ? 'Show question side' : 'Reveal answer side'}
        className="flex min-h-64 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-bg p-6 text-center shadow-sm transition-all hover:border-primary-400 focus:border-primary-500 focus:outline-none"
      >
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            {flipped ? 'Answer' : 'Question'}
          </span>
          {currentCard.topic ? <Badge tone="neutral">{currentCard.topic}</Badge> : null}
          {currentCard.mastered ? <Badge tone="success">Mastered</Badge> : null}
        </div>

        {currentCard.imageUrl ? (
          <AuthenticatedCardImage
            src={currentCard.imageUrl}
            alt={currentCard.front}
            className="max-h-48 max-w-full rounded-xl border border-line object-contain"
          />
        ) : null}

        <p className="max-w-xl whitespace-pre-wrap text-base font-medium leading-relaxed text-fg sm:text-lg">
          {flipped ? currentCard.back : currentCard.front}
        </p>

        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          {flipped
            ? 'Rate recall below or swipe (Left: Again · Right: Good)'
            : 'Click, tap, or press Space to reveal answer'}
        </span>
      </button>

      {flipped ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {RATING_OPTIONS.map((opt) => (
              <button
                key={opt.rating}
                type="button"
                disabled={submitting}
                onClick={() => void handleRate(opt.rating)}
                className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${opt.toneClass}`}
              >
                <span>
                  {opt.label}{' '}
                  <kbd className="ml-1 rounded bg-white/60 px-1 py-0.5 text-[10px] font-medium dark:bg-black/25">
                    {opt.shortcut}
                  </kbd>
                </span>
                <span className="mt-0.5 text-xs font-normal opacity-85">
                  Next: {currentCard.intervalHints[opt.rating]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button type="button" size="md" onClick={() => setFlipped(true)}>
            Show answer
          </Button>
        </div>
      )}
    </Card>
  );
}
