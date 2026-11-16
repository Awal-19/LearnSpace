import { useState } from 'react';
import { DecksTab } from './DecksTab';
import { QuizzesTab } from './QuizzesTab';

export function StudyPage() {
  const [tab, setTab] = useState<'decks' | 'quizzes'>('decks');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div role="tablist" aria-label="Study tools" className="flex gap-2 border-b border-line pb-px">
        {(
          [
            { id: 'decks', label: 'Flashcards' },
            { id: 'quizzes', label: 'Quizzes' },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === 'decks' ? <DecksTab /> : <QuizzesTab />}
      </div>
    </div>
  );
}

