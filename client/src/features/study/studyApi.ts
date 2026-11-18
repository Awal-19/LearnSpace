import { request } from '../../lib/apiClient';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface CardIntervalHints {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export interface CardItem {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  imageUrl: string | null;
  position: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
  mastered: boolean;
  accuracy: number | null;
  reviewCount: number;
  intervalHints: CardIntervalHints;
}

export interface DeckSummary {
  id: string;
  title: string;
  topic: string | null;
  noteId: string | null;
  documentId: string | null;
  courseId: string | null;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  accuracy: number | null;
  reviewCount: number;
  streakDays: number;
  createdAt: string;
}

export interface DeckDetail extends DeckSummary {
  cards: CardItem[];
}

export interface DueSummaryResponse {
  dueTodayCount: number;
  reviewedTodayCount: number;
  streakDays: number;
  decks: Array<{
    deckId: string;
    title: string;
    courseId: string | null;
    dueCount: number;
  }>;
}

export interface DueQueueResponse {
  deck: DeckSummary;
  cards: CardItem[];
}

export interface ReviewCardResponse {
  card: CardItem;
  review: {
    id: string;
    rating: ReviewRating;
    quality: number;
    previousInterval: number;
    nextInterval: number;
    easeFactorAfter: number;
    dueAt: string;
    reviewedAt: string;
  };
  deckDueCount: number;
}

export interface ImportCsvResponse {
  importedCount: number;
  skippedRows: number;
  cards: CardItem[];
}

export function listDecks(
  courseId?: string,
): Promise<{ items: DeckSummary[]; nextCursor: string | null }> {
  const sp = new URLSearchParams();
  if (courseId) sp.set('courseId', courseId);
  const qs = sp.toString();
  return request<{ items: DeckSummary[]; nextCursor: string | null }>(
    qs ? `/decks?${qs}` : '/decks',
  );
}

export function getDueSummary(): Promise<DueSummaryResponse> {
  return request<DueSummaryResponse>('/decks/due-summary');
}

export function getDeck(deckId: string): Promise<DeckDetail> {
  return request<DeckDetail>(`/decks/${deckId}`);
}

export function getDueCards(deckId: string): Promise<DueQueueResponse> {
  return request<DueQueueResponse>(`/decks/${deckId}/due`);
}

export function createDeck(payload: {
  title: string;
  topic?: string;
  courseId?: string | null;
  cards?: Array<{ front: string; back: string; topic?: string | null }>;
}): Promise<DeckDetail> {
  return request<DeckDetail>('/decks', { method: 'POST', body: payload });
}

export function generateDeck(payload: {
  topic?: string;
  noteId?: string;
  documentId?: string;
  courseId?: string | null;
  count?: number;
}): Promise<DeckDetail> {
  return request<DeckDetail>('/decks/generate', { method: 'POST', body: payload });
}

export function updateDeck(
  deckId: string,
  payload: { title?: string; courseId?: string | null },
): Promise<DeckSummary> {
  return request<DeckSummary>(`/decks/${deckId}`, { method: 'PATCH', body: payload });
}

export function deleteDeck(deckId: string): Promise<void> {
  return request<void>(`/decks/${deckId}`, { method: 'DELETE' });
}

export function createCard(
  deckId: string,
  payload: { front: string; back: string; topic?: string | null },
): Promise<CardItem> {
  return request<CardItem>(`/decks/${deckId}/cards`, { method: 'POST', body: payload });
}

export function updateCard(
  cardId: string,
  payload: { front?: string; back?: string; topic?: string | null; position?: number },
): Promise<CardItem> {
  return request<CardItem>(`/cards/${cardId}`, { method: 'PATCH', body: payload });
}

export function deleteCard(cardId: string): Promise<void> {
  return request<void>(`/cards/${cardId}`, { method: 'DELETE' });
}

export function reviewCard(cardId: string, rating: ReviewRating): Promise<ReviewCardResponse> {
  return request<ReviewCardResponse>(`/cards/${cardId}/review`, {
    method: 'POST',
    body: { rating },
  });
}

export function importCardsCsv(
  deckId: string,
  csvText: string,
  hasHeader: boolean,
): Promise<ImportCsvResponse> {
  return request<ImportCsvResponse>(`/decks/${deckId}/import-csv`, {
    method: 'POST',
    body: { csvText, hasHeader },
  });
}

export function uploadCardImage(cardId: string, file: File): Promise<CardItem> {
  const form = new FormData();
  form.append('file', file);
  return request<CardItem>(`/cards/${cardId}/image`, { method: 'POST', body: form });
}

export function deleteCardImage(cardId: string): Promise<CardItem> {
  return request<CardItem>(`/cards/${cardId}/image`, { method: 'DELETE' });
}
