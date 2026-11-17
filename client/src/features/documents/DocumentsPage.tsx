import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  FileQuestion,
  FileText,
  FileUp,
  Loader2,
  Presentation,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { CameraCaptureModal } from '../chat/CameraCaptureModal';
import { formatBytes, prepareImageForUpload } from '../chat/imagePrep';
import {
  deleteDocument,
  getDocumentDetail,
  listDocuments,
  uploadDocument,
  type DocumentDetailResponse,
  type DocumentType,
  type StudyDoc,
} from './documentsApi';
import { PastQuestionsWorkspace } from './PastQuestionsWorkspace';
import { SlideQuestionsWorkspace } from './SlideQuestionsWorkspace';

interface CourseItem {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<DocumentType, string> = {
  past_question: 'Past Question / Exam',
  slides: 'Lecture Slides',
  notes: 'Course Notes',
};

const STATUS_TONE: Record<StudyDoc['status'], 'neutral' | 'warning' | 'success' | 'danger'> = {
  uploaded: 'neutral',
  extracting: 'warning',
  ready: 'success',
  failed: 'danger',
};

export function DocumentsPage() {
  const { documentId } = useParams<{ documentId?: string }>();
  const navigate = useNavigate();
  const appPath = useAppPath();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filterType, setFilterType] = useState<DocumentType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Upload state
  const [uploadType, setUploadType] = useState<DocumentType>('past_question');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCourseId, setUploadCourseId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Active document detail mode
  const [activeMode, setActiveMode] = useState<'answer' | 'generate'>('answer');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCamRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: ({ signal }) => request<CourseItem[]>('/courses', { signal }).catch(() => []),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const docsQuery = useQuery({
    queryKey: ['documents', 'list', { type: filterType || 'all', q: debouncedSearch }],
    queryFn: ({ signal }) =>
      listDocuments(
        {
          type: filterType || undefined,
          q: debouncedSearch || undefined,
          page: 1,
          pageSize: 50,
        },
        signal,
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 429) return false;
      return failureCount < 1;
    },
  });

  const detailQuery = useQuery({
    queryKey: ['documents', 'detail', documentId],
    queryFn: ({ signal }) => getDocumentDetail(documentId!, signal),
    enabled: Boolean(documentId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 429) return false;
      return failureCount < 1;
    },
  });

  const docs = docsQuery.data?.documents ?? [];
  const courses = Array.isArray(coursesQuery.data) ? coursesQuery.data : [];
  const loadingList = docsQuery.isLoading;
  const detail: DocumentDetailResponse | null = detailQuery.data ?? null;
  const loadingDetail = detailQuery.isLoading;

  useEffect(() => {
    if (!detail) return;
    setActiveMode(detail.document.type === 'past_question' ? 'answer' : 'generate');
  }, [detail?.document.id, detail?.document.type]);

  // De-duplicated toast notification for rate limits without piling up
  useEffect(() => {
    const err = detailQuery.error ?? docsQuery.error;
    if (!(err instanceof ApiError)) return;
    if (err.status === 429) {
      toast.show({
        kind: 'info',
        dedupeKey: 'documents-rate-limit',
        title: "You're doing that a bit too fast",
        description: err.retryAfterSeconds
          ? `Please wait ${err.retryAfterSeconds}s and try again.`
          : 'Please wait a few seconds and try again.',
      });
    }
  }, [detailQuery.error, docsQuery.error, toast]);

  const isDetailProcessing = Boolean(
    documentId &&
      detail &&
      (detail.document.status === 'uploaded' ||
        detail.document.status === 'extracting' ||
        detail.latestJob?.status === 'queued' ||
        detail.latestJob?.status === 'running'),
  );

  // Visibility-aware exponential backoff polling for active document processing
  useEffect(() => {
    if (!documentId || !isDetailProcessing) return;
    const BACKOFF_MS = [3000, 5000, 10000, 15000];
    let step = 0;
    let timer: number | undefined;
    let cancelled = false;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === 'visible') {
          const result = await detailQuery.refetch();
          if (result.error instanceof ApiError && result.error.status === 429) {
            const waitMs = (result.error.retryAfterSeconds ?? 10) * 1000;
            schedule(waitMs);
            return;
          }
          step = Math.min(step + 1, BACKOFF_MS.length - 1);
        }
        if (!cancelled) {
          schedule(BACKOFF_MS[step] ?? 15000);
        }
      }, delayMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void detailQuery.refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    schedule(BACKOFF_MS[0] ?? 3000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [documentId, isDetailProcessing]);

  const hasListProcessing =
    !documentId && docs.some((d) => d.status === 'uploaded' || d.status === 'extracting');

  // Single-request backoff polling on list view only when any document is still processing
  useEffect(() => {
    if (!hasListProcessing) return;
    const BACKOFF_MS = [3000, 5000, 10000, 15000];
    let step = 0;
    let timer: number | undefined;
    let cancelled = false;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === 'visible') {
          const result = await docsQuery.refetch();
          if (result.error instanceof ApiError && result.error.status === 429) {
            schedule((result.error.retryAfterSeconds ?? 10) * 1000);
            return;
          }
          step = Math.min(step + 1, BACKOFF_MS.length - 1);
        }
        if (!cancelled) {
          schedule(BACKOFF_MS[step] ?? 15000);
        }
      }, delayMs);
    };

    schedule(BACKOFF_MS[0] ?? 3000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [hasListProcessing]);

  const handleFileUpload = async (rawFile: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const prepared = rawFile.type.startsWith('image/')
        ? await prepareImageForUpload(rawFile)
        : rawFile;
      const res = await uploadDocument({
        file: prepared,
        type: uploadType,
        title: uploadTitle || undefined,
        courseId: uploadCourseId || undefined,
        onProgress: setUploadProgress,
      });
      setUploadTitle('');
      toast.show({ kind: 'success', title: 'Uploaded — processing document…' });
      await queryClient.invalidateQueries({ queryKey: ['documents', 'list'] });
      navigate(appPath(`/documents/${res.document.id}`));
    } catch (err) {
      toast.show({
        kind: 'error',
        dedupeKey: 'document-upload-error',
        title: 'Upload failed',
        description: err instanceof ApiError ? err.message : 'Check file type and size.',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFileUpload(file);
  };

  const handleTakePhoto = () => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      mobileCamRef.current?.click();
    } else {
      setCameraOpen(true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      toast.show({ kind: 'success', title: 'Document deleted' });
      if (documentId === id) {
        navigate(appPath('/documents'));
      }
      await queryClient.invalidateQueries({ queryKey: ['documents', 'list'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  if (documentId) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(appPath('/documents'))}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            All documents
          </Button>

          {detail ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={activeMode === 'answer' ? 'primary' : 'secondary'}
                onClick={() => setActiveMode('answer')}
              >
                <FileQuestion className="mr-1.5 h-4 w-4" />
                Answer Past Questions
              </Button>
              <Button
                size="sm"
                variant={activeMode === 'generate' ? 'primary' : 'secondary'}
                onClick={() => setActiveMode('generate')}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Generate Questions
              </Button>
            </div>
          ) : null}
        </div>

        {detailQuery.isError && !detail ? (
          <Card className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
            <p className="text-sm font-medium">
              {detailQuery.error instanceof ApiError && detailQuery.error.status === 429
                ? "You're doing that a bit too fast, please wait a few seconds."
                : 'Could not load this document right now.'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </Card>
        ) : loadingDetail || !detail ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-xl font-semibold">{detail.document.title}</h1>
                    <Badge tone={STATUS_TONE[detail.document.status]}>
                      {detail.document.status}
                    </Badge>
                    <Badge tone="neutral">{TYPE_LABELS[detail.document.type]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {detail.document.originalName} · {formatBytes(detail.document.sizeBytes)} ·{' '}
                    {detail.document.pageCount || 1} page(s)/slide(s)
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleDelete(detail.document.id)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4 text-danger" />
                  Delete
                </Button>
              </div>

              {detail.document.status === 'uploaded' || detail.document.status === 'extracting' ? (
                <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface2 p-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />
                      Extracting text & running OCR…
                    </span>
                    <span>{detail.latestJob?.progress ?? 10}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-primary-600 transition-all"
                      style={{ width: `${detail.latestJob?.progress ?? 10}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {detail.document.status === 'failed' ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{detail.document.errorMessage ?? 'Document processing failed.'}</span>
                </div>
              ) : null}

              {detail.document.truncated ? (
                <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
                  Note: This document is very large, so extracted content was capped at 120,000
                  characters.
                </p>
              ) : null}
            </Card>

            {detail.document.status === 'ready' ? (
              activeMode === 'answer' ? (
                <PastQuestionsWorkspace
                  detail={detail}
                  onRefresh={async () => {
                    await detailQuery.refetch();
                  }}
                />
              ) : (
                <SlideQuestionsWorkspace
                  detail={detail}
                  onRefresh={async () => {
                    await detailQuery.refetch();
                  }}
                />
              )
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <FileUp className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Study from Documents
          </h1>
          <p className="mt-1 text-sm text-muted">
            Upload past exam papers to get step-by-step worked answers, or upload lecture slides to
            generate practice questions.
          </p>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="grid gap-3.5 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Document type</span>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as DocumentType)}
              className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="past_question">Past Question / Exam / Quiz</option>
              <option value="slides">Lecture Slides (PPTX / PDF)</option>
              <option value="notes">Course Notes</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Title (optional)</span>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. CSC 201 Midterm 2025"
              className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Course (optional)</span>
            <select
              value={uploadCourseId}
              onChange={(e) => setUploadCourseId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragActive ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-950/20' : 'border-line bg-surface2/40'
          }`}
        >
          <UploadCloud className="h-8 w-8 text-primary-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-fg">
            Drag & drop PDF, DOCX, PPTX, TXT, CSV, or photo here
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Images up to 10 MB · Documents up to 20 MB
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-1.5 h-4 w-4" />
              Choose file
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={uploading}
              onClick={handleTakePhoto}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              Take photo
            </Button>
          </div>

          {uploading ? (
            <div className="mt-4 w-full max-w-xs space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>Uploading…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full bg-primary-600 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.txt,.csv,image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFileUpload(file);
            }}
          />
          <input
            ref={mobileCamRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFileUpload(file);
            }}
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Your Document Library</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents…"
            className="rounded-xl border border-line bg-surface2/50 px-3 py-1.5 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DocumentType | '')}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-1.5 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          >
            <option value="">All types</option>
            <option value="past_question">Past Questions</option>
            <option value="slides">Slides</option>
            <option value="notes">Notes</option>
          </select>
        </div>
      </div>

      {docsQuery.isError && docs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <AlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
          <p className="text-sm font-medium">
            {docsQuery.error instanceof ApiError && docsQuery.error.status === 429
              ? "You're doing that a bit too fast, please wait a few seconds."
              : 'Could not load your documents right now.'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void docsQuery.refetch()}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </Card>
      ) : loadingList ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload a past exam paper, lecture slides, or notes above to get started."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <Card
              key={doc.id}
              className="group flex flex-col justify-between p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:border-primary-400/60 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400">
                      {doc.type === 'slides' ? (
                        <Presentation className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.title}`}
                    onClick={() => void handleDelete(doc.id)}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="mt-3 font-semibold text-fg line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {doc.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {TYPE_LABELS[doc.type]} · {formatBytes(doc.sizeBytes)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(appPath(`/documents/${doc.id}`))}
                >
                  {doc.type === 'past_question' ? 'Answer Questions' : 'Open'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(appPath(`/documents/${doc.id}`))}
                >
                  Generate
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          void handleFileUpload(file);
        }}
      />
    </div>
  );
}

