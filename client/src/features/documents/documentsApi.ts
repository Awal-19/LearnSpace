import {
  API_BASE_URL,
  ApiError,
  downloadFile,
  getAccessToken,
  request,
  requestRaw,
} from '../../lib/apiClient';

export type DocumentType = 'past_question' | 'slides' | 'notes';
export type DocumentStatus = 'uploaded' | 'extracting' | 'ready' | 'failed';
export type AnswerMode = 'full_worked' | 'answers_only' | 'marking_scheme';

export interface DocumentPageInfo {
  index: number;
  label: string;
  text: string;
  hasImages: boolean;
}

export interface StudyDoc {
  id: string;
  title: string;
  type: DocumentType;
  courseId: string | null;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'document';
  sizeBytes: number;
  pageCount: number;
  truncated: boolean;
  status: DocumentStatus;
  errorMessage: string | null;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentJob {
  id: string;
  documentId: string;
  kind: 'extract' | 'detect_questions' | 'generate_set';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  error: string | null;
}

export interface ExtractedQuestion {
  id: string;
  documentId: string;
  position: number;
  section: string | null;
  questionNumber: string;
  prompt: string;
  marks: number | null;
  instructions: string | null;
  unclear: boolean;
  unclearReason: string | null;
  selected: boolean;
  answerMode: AnswerMode;
  answerMarkdown: string | null;
  thinkingMarkdown: string | null;
  citedSourcesJson: string[] | null;
  status: 'pending' | 'answering' | 'answered' | 'error';
}

export interface DocumentDetailResponse {
  document: StudyDoc & {
    extractedText: string;
    pagesJson: DocumentPageInfo[];
  };
  latestJob: DocumentJob | null;
  extractedQuestions: ExtractedQuestion[];
  questionSets: GeneratedQuestionSet[];
}

export type GeneratedQuestionType =
  'mcq' | 'true_false' | 'short_answer' | 'essay' | 'fill_blank' | 'calculation' | 'flashcard';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedQuestion {
  id: string;
  setId: string;
  position: number;
  type: GeneratedQuestionType;
  difficulty: QuestionDifficulty;
  topic: string;
  prompt: string;
  optionsJson: string[] | null;
  correctAnswer: string;
  explanation: string;
  sourceRef: string;
}

export interface DocumentPracticeAttempt {
  id: string;
  setId: string;
  answersJson: Record<string, string>;
  score: number;
  total: number;
  weakTopicsJson: string[];
  feedbackJson: Array<{ questionId: string; correct: boolean; feedback: string }>;
  takenAt: string;
}

export interface GeneratedQuestionSet {
  id: string;
  documentId: string;
  title: string;
  settingsJson: Record<string, unknown>;
  quizId: string | null;
  deckId: string | null;
  createdAt: string;
  questions: GeneratedQuestion[];
  attempts?: DocumentPracticeAttempt[];
}

export function listDocuments(
  params?: {
    type?: DocumentType;
    courseId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal,
): Promise<{ documents: StudyDoc[]; total: number; page: number; pageSize: number }> {
  const sp = new URLSearchParams();
  if (params?.type) sp.set('type', params.type);
  if (params?.courseId) sp.set('courseId', params.courseId);
  if (params?.q) sp.set('q', params.q);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  return request<{ documents: StudyDoc[]; total: number; page: number; pageSize: number }>(
    `/documents${qs ? `?${qs}` : ''}`,
    { signal },
  );
}

export function getDocumentDetail(
  id: string,
  signal?: AbortSignal,
): Promise<DocumentDetailResponse> {
  return request<DocumentDetailResponse>(`/documents/${id}`, { signal });
}

export function updateDocumentMetadata(
  id: string,
  payload: { title?: string; type?: DocumentType; courseId?: string | null },
): Promise<StudyDoc> {
  return request<StudyDoc>(`/documents/${id}`, { method: 'PATCH', body: payload });
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: 'DELETE' });
}

export function uploadDocument(params: {
  file: File;
  type: DocumentType;
  title?: string;
  courseId?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ document: StudyDoc; job: DocumentJob }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', params.file);
    form.append('type', params.type);
    if (params.title?.trim()) form.append('title', params.title.trim());
    if (params.courseId) form.append('courseId', params.courseId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/documents`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'learnspace');
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && params.onProgress) {
        params.onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as { document: StudyDoc; job: DocumentJob });
        return;
      }
      const errObj = (body as { error?: { code?: string; message?: string } } | null)?.error;
      reject(
        new ApiError(
          xhr.status,
          errObj?.code ?? 'UPLOAD_ERROR',
          errObj?.message ?? `Upload failed (${xhr.status})`,
        ),
      );
    };

    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Network error during upload'));
    xhr.send(form);
  });
}

export function detectQuestions(documentId: string): Promise<{ job: DocumentJob }> {
  return request<{ job: DocumentJob }>(`/documents/${documentId}/detect-questions`, {
    method: 'POST',
  });
}

export function patchQuestions(
  documentId: string,
  questions: Array<{
    id?: string;
    section?: string | null;
    questionNumber: string;
    prompt: string;
    marks?: number | null;
    instructions?: string | null;
    unclear?: boolean;
    unclearReason?: string | null;
    selected?: boolean;
  }>,
): Promise<{ questions: ExtractedQuestion[] }> {
  return request<{ questions: ExtractedQuestion[] }>(`/documents/${documentId}/questions`, {
    method: 'PATCH',
    body: { questions },
  });
}

export async function streamQuestionAnswer(params: {
  documentId: string;
  questionId: string;
  mode: AnswerMode;
  useCourseNotes: boolean;
  refinement?: 'regenerate' | 'simpler' | 'another_method';
  signal?: AbortSignal;
  onMeta?: (meta: { questionId: string; citedSources: string[] }) => void;
  onDelta: (text: string) => void;
  onDone: (question: ExtractedQuestion) => void;
}): Promise<void> {
  const res = await requestRaw(
    `/documents/${params.documentId}/questions/${params.questionId}/answer`,
    {
      method: 'POST',
      cookie: true,
      signal: params.signal,
      body: {
        mode: params.mode,
        useCourseNotes: params.useCourseNotes,
        refinement: params.refinement,
      },
    },
  );

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming response unavailable');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      if (!rawEvent.trim() || rawEvent.startsWith(':')) continue;

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      const dataStr = dataLines.join('\n');
      if (!dataStr) continue;
      const parsed = JSON.parse(dataStr) as Record<string, unknown>;

      if (eventName === 'meta' && params.onMeta) {
        params.onMeta(parsed as { questionId: string; citedSources: string[] });
      } else if (eventName === 'delta') {
        params.onDelta(String(parsed.text ?? ''));
      } else if (eventName === 'done') {
        params.onDone(parsed.question as ExtractedQuestion);
      } else if (eventName === 'error') {
        throw new ApiError(
          502,
          String(parsed.code ?? 'AI_PROVIDER_ERROR'),
          String(parsed.message ?? 'AI error'),
        );
      }
    }
  }
}

export async function exportDocumentAnswers(
  documentId: string,
  format: 'pdf' | 'docx',
  filenameFallback: string,
): Promise<void> {
  await downloadFile(`/documents/${documentId}/export`, `${filenameFallback}.${format}`, {
    method: 'POST',
    cookie: true,
    body: { format },
  });
}

export function saveDocumentAnswersToNotes(
  documentId: string,
  opts?: { title?: string; courseId?: string | null },
): Promise<{ noteId: string; title: string }> {
  return request<{ noteId: string; title: string }>(`/documents/${documentId}/save-to-notes`, {
    method: 'POST',
    body: opts ?? {},
  });
}

export function generateQuestionsFromDoc(
  documentId: string,
  settings: {
    types: GeneratedQuestionType[];
    count: number;
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
    scope: 'whole' | 'pages' | 'topic';
    selectedPages?: number[];
    topic?: string;
    style: 'exam' | 'quick_revision';
    title?: string;
  },
): Promise<{ job: DocumentJob }> {
  return request<{ job: DocumentJob }>(`/documents/${documentId}/generate-questions`, {
    method: 'POST',
    body: settings,
  });
}

export function refineGeneratedQuestion(
  setId: string,
  questionId: string,
  action: 'regenerate' | 'harder' | 'easier' | 'more_on_topic',
): Promise<{ question: GeneratedQuestion; addedQuestions?: GeneratedQuestion[] }> {
  return request<{ question: GeneratedQuestion; addedQuestions?: GeneratedQuestion[] }>(
    `/question-sets/${setId}/questions/${questionId}/refine`,
    {
      method: 'POST',
      body: { action },
    },
  );
}

export function submitPracticeAttempt(
  setId: string,
  answers: Record<string, string>,
): Promise<{ attempt: DocumentPracticeAttempt }> {
  return request<{ attempt: DocumentPracticeAttempt }>(`/question-sets/${setId}/attempts`, {
    method: 'POST',
    body: { answers },
  });
}

export function saveSetToLibrary(
  setId: string,
  target: 'quiz' | 'deck' | 'both' = 'both',
  title?: string,
): Promise<{ quizId: string | null; deckId: string | null }> {
  return request<{ quizId: string | null; deckId: string | null }>(
    `/question-sets/${setId}/save-to-library`,
    {
      method: 'POST',
      body: { target, title },
    },
  );
}

export async function exportQuestionSet(
  setId: string,
  format: 'pdf' | 'docx',
  filenameFallback: string,
): Promise<void> {
  await downloadFile(`/question-sets/${setId}/export`, `${filenameFallback}.${format}`, {
    method: 'POST',
    cookie: true,
    body: { format },
  });
}
