import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../app/AuthContext';
import { Sidebar } from '../../app/layouts/Sidebar';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { DashboardPage } from '../dashboard/DashboardPage';
import { DocumentsPage } from '../documents/DocumentsPage';
import { StudyPage } from './StudyPage';
import type { CardItem, DeckDetail, DeckSummary } from './studyApi';

function makeAuth(): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'user-1',
      email: 'student@learnspace.edu',
      name: 'Ada Lovelace',
      emailVerified: true,
      avatarUrl: null,
    },
    setSession: () => undefined,
    updateUser: () => undefined,
    clearSession: () => undefined,
    logout: async () => undefined,
    markEmailVerified: () => undefined,
  };
}

function makeCard(overrides: Partial<CardItem> = {}): CardItem {
  return {
    id: 'card-1',
    front: 'What is Dijkstra used for?',
    back: 'Single-source shortest paths with non-negative weights',
    topic: 'Graphs',
    imageUrl: null,
    position: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: new Date(Date.now() - 60_000).toISOString(),
    lastReviewedAt: null,
    mastered: false,
    accuracy: null,
    reviewCount: 0,
    intervalHints: { again: '10m', hard: '1d', good: '1d', easy: '4d' },
    ...overrides,
  };
}

function makeDeck(overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    id: 'deck-1',
    title: 'Algorithms',
    topic: 'Graphs',
    noteId: null,
    documentId: null,
    courseId: null,
    cardCount: 2,
    dueCount: 2,
    masteredCount: 0,
    accuracy: null,
    reviewCount: 0,
    streakDays: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/app/study']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setAccessToken('test-token');
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthContext.Provider value={makeAuth()}>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('Flashcards SM-2 & Spaced Repetition UI', () => {
  it('reviews due flashcards with flip, keyboard shortcuts, and SM-2 rating submission', async () => {
    const user = userEvent.setup();
    let cards: CardItem[] = [
      makeCard({ id: 'c1', front: 'Question One', back: 'Answer One', position: 0 }),
      makeCard({ id: 'c2', front: 'Question Two', back: 'Answer Two', position: 1 }),
    ];
    const deck = makeDeck({ id: 'deck-1', title: 'Algorithms', cardCount: 2, dueCount: 2 });
    const reviewedRatings: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes('/courses')) return Response.json([]);
      if (url.includes('/notes')) return Response.json({ items: [] });
      if (url.includes('/documents'))
        return Response.json({ documents: [], total: 0, page: 1, pageSize: 50 });
      if (url.includes('/decks/due-summary')) {
        return Response.json({
          dueTodayCount: cards.length,
          reviewedTodayCount: reviewedRatings.length,
          streakDays: reviewedRatings.length > 0 ? 1 : 0,
          decks:
            cards.length > 0
              ? [{ deckId: 'deck-1', title: 'Algorithms', courseId: null, dueCount: cards.length }]
              : [],
        });
      }
      if (url.endsWith('/decks')) {
        return Response.json({ items: [{ ...deck, dueCount: cards.length }], nextCursor: null });
      }
      if (url.endsWith('/decks/deck-1/due')) {
        return Response.json({ deck: { ...deck, dueCount: cards.length }, cards });
      }
      if (url.endsWith('/decks/deck-1')) {
        const detail: DeckDetail = { ...deck, dueCount: cards.length, cards };
        return Response.json(detail);
      }
      if (url.includes('/cards/') && url.endsWith('/review') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { rating: string };
        reviewedRatings.push(body.rating);
        const cardId = url.split('/cards/')[1]!.split('/')[0]!;
        cards = cards.filter((c) => c.id !== cardId);
        return Response.json({
          card: makeCard({ id: cardId, repetitions: 1, intervalDays: 1 }),
          review: {
            id: 'r1',
            rating: body.rating,
            quality: 3,
            previousInterval: 0,
            nextInterval: 1,
            easeFactorAfter: 2.5,
            dueAt: new Date(Date.now() + 86_400_000).toISOString(),
            reviewedAt: new Date().toISOString(),
          },
          deckDueCount: cards.length,
        });
      }
      return Response.json({});
    });

    renderWithProviders(<StudyPage />, ['/app/study?tab=decks&deckId=deck-1']);

    expect(await screen.findByRole('heading', { name: 'Algorithms' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Review due \(2\)/i }));

    expect(await screen.findByText('Question One')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reveal answer side/i }));
    expect(screen.getByText('Answer One')).toBeInTheDocument();
    expect(screen.getByText('Next: 10m')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Good/i }));
    expect(await screen.findByText('Question Two')).toBeInTheDocument();

    // Flip with Space key and rate Easy with "4"
    fireEvent.keyDown(window, { key: ' ' });
    expect(await screen.findByText('Answer Two')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '4' });

    expect(await screen.findByText('Review session complete')).toBeInTheDocument();
    expect(reviewedRatings).toEqual(['good', 'easy']);
  });

  it('opens CSV import modal and imports flashcards in bulk', async () => {
    const user = userEvent.setup();
    const deck = makeDeck({ id: 'deck-csv', title: 'Networking', cardCount: 0, dueCount: 0 });
    let importedPayload: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.includes('/courses')) return Response.json([]);
      if (url.includes('/notes')) return Response.json({ items: [] });
      if (url.includes('/documents'))
        return Response.json({ documents: [], total: 0, page: 1, pageSize: 50 });
      if (url.includes('/decks/due-summary')) {
        return Response.json({ dueTodayCount: 0, reviewedTodayCount: 0, streakDays: 0, decks: [] });
      }
      if (url.endsWith('/decks')) return Response.json({ items: [deck], nextCursor: null });
      if (url.endsWith('/decks/deck-csv')) return Response.json({ ...deck, cards: [] });
      if (url.endsWith('/decks/deck-csv/import-csv') && method === 'POST') {
        importedPayload = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({
          importedCount: 1,
          skippedRows: 0,
          cards: [makeCard({ id: 'imported-1', front: 'TCP', back: 'Reliable transport' })],
        });
      }
      return Response.json({});
    });

    renderWithProviders(<StudyPage />, ['/app/study?deckId=deck-csv']);
    expect(await screen.findByRole('heading', { name: 'Networking' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import CSV/i }));
    const textarea = await screen.findByLabelText('CSV rows');
    await user.type(textarea, 'Front,Back\nTCP,Reliable transport');
    await user.click(screen.getByRole('button', { name: 'Import flashcards' }));

    await waitFor(() => {
      expect(importedPayload).toEqual({
        csvText: 'Front,Back\nTCP,Reliable transport',
        hasHeader: true,
      });
    });
  });

  it('triggers "Make flashcards from this" from a ready Document detail page', async () => {
    const user = userEvent.setup();
    let generatedDocId: string | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.includes('/courses')) return Response.json([]);
      if (url.includes('/documents/doc-9')) {
        return Response.json({
          document: {
            id: 'doc-9',
            title: 'OS Week 3',
            type: 'slides',
            courseId: null,
            originalName: 'week3.pdf',
            mimeType: 'application/pdf',
            kind: 'document',
            sizeBytes: 2048,
            pageCount: 12,
            truncated: false,
            status: 'ready',
            errorMessage: null,
            contentUrl: '/api/v1/documents/doc-9/content',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          latestJob: null,
          extractedQuestions: [],
          questionSets: [],
        });
      }
      if (url.endsWith('/decks/generate') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { documentId?: string };
        generatedDocId = body.documentId ?? null;
        return Response.json({
          ...makeDeck({ id: 'new-doc-deck', documentId: 'doc-9', title: 'OS Week 3' }),
          cards: [makeCard()],
        });
      }
      if (url.includes('/decks/due-summary')) {
        return Response.json({ dueTodayCount: 1, reviewedTodayCount: 0, streakDays: 0, decks: [] });
      }
      if (url.includes('/decks')) return Response.json({ items: [], nextCursor: null });
      if (url.includes('/notes')) return Response.json({ items: [] });
      if (url.includes('/documents'))
        return Response.json({ documents: [], total: 0, page: 1, pageSize: 50 });
      return Response.json({});
    });

    renderWithProviders(
      <Routes>
        <Route path="/documents/:documentId" element={<DocumentsPage />} />
        <Route path="/study" element={<p>Navigated to Study</p>} />
      </Routes>,
      ['/documents/doc-9'],
    );

    const btn = await screen.findByRole('button', { name: /Make flashcards from this/i });
    await user.click(btn);

    await waitFor(() => {
      expect(generatedDocId).toBe('doc-9');
      expect(screen.getByText('Navigated to Study')).toBeInTheDocument();
    });
  });

  it('shows due flashcards count on both the Sidebar and Dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/decks/due-summary')) {
        return Response.json({
          dueTodayCount: 7,
          reviewedTodayCount: 2,
          streakDays: 3,
          decks: [{ deckId: 'd1', title: 'OS', courseId: null, dueCount: 7 }],
        });
      }
      if (url.includes('/dashboard')) {
        return Response.json({
          greetingName: 'Ada',
          timezone: 'UTC',
          todayTasks: [],
          overdueCount: 0,
          upcoming: [],
          todayClasses: [],
          nextClass: null,
          upcomingExams: [],
          dueFlashcardsCount: 7,
          stats: { streakDays: 4, hoursLast7Days: 6.5 },
          recentConversations: [],
          unreadNotifications: 0,
        });
      }
      return Response.json({});
    });

    renderWithProviders(
      <div>
        <Sidebar />
        <DashboardPage />
      </div>,
      ['/app'],
    );

    expect(await screen.findByLabelText('7 due')).toBeInTheDocument();
    expect(await screen.findByText('7 due')).toBeInTheDocument();
  });
});
