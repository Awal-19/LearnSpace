import { useState } from 'react';
import { CheckCircle2, Layers } from 'lucide-react';
import { DecksTab } from './DecksTab';
import { QuizzesTab } from './QuizzesTab';

export function StudyPage() {
  const [tab, setTab] = useState<'decks' | 'quizzes'>('decks');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Study Tools
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Master concepts with spaced-repetition flashcards and interactive practice quizzes.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Study tools"
          className="inline-flex w-fit rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          {(
            [
              { id: 'decks', label: 'Flashcards', icon: Layers },
              { id: 'quizzes', label: 'Quizzes', icon: CheckCircle2 },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-base ease-soft ${
                  active
                    ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                    : 'text-muted hover:text-fg'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">
        {tab === 'decks' ? <DecksTab /> : <QuizzesTab />}
      </div>
    </div>
  );
}

