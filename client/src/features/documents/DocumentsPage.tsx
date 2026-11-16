import {
  AlertCircle,
  ArrowLeft,
  Camera,
  FileQuestion,
  FileText,
  FileUp,
  Loader2,
  Presentation,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
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

  const [docs, setDocs] = useState<StudyDoc[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filterType, setFilterType] = useState<DocumentType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploadType, setUploadType] = useState<DocumentType>('past_question');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCourseId, setUploadCourseId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Active document detail state
  const [detail, setDetail] = useState<DocumentDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeMode, setActiveMode] = useState<'answer' | 'generate'>('answer');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCamRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    setLoadingList(true);
    try {
      const [docsRes, coursesRes] = await Promise.all([
        listDocuments({
          type: filterType || undefined,
          q: searchQuery.trim() || undefined,
        }),
        request<CourseItem[]>('/courses').catch(() => []),
      ]);
      setDocs(Array.isArray(docsRes.documents) ? docsRes.documents : []);
      setCourses(Array.isArray(coursesRes) ? coursesRes : []);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not load documents',
        description: err instanceof ApiError ? err.message : 'Please refresh.',
      });
    } finally {
      setLoadingList(false);
    }
  }, [filterType, searchQuery, toast]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const loadDetail = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setLoadingDetail(true);
      try {
        const res = await getDocumentDetail(id);
        setDetail(res);
        setActiveMode(res.document.type === 'past_question' ? 'answer' : 'generate');
      } catch (err) {
        toast.show({
          kind: 'error',
          title: 'Could not load document',
          description: err instanceof ApiError ? err.message : 'Try again.',
        });
        navigate(appPath('/documents'), { replace: true });
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [appPath, navigate, toast],
  );

  useEffect(() => {
    if (!documentId) {
      setDetail(null);
      return;
    }
    void loadDetail(documentId);
  }, [documentId, loadDetail]);

  // Poll while document extraction or background job is active
  useEffect(() => {
    if (!documentId || !detail) return;
    const isDocBusy = detail.document.status === 'uploaded' || detail.document.status === 'extracting';
    const isJobBusy =
      detail.latestJob?.status === 'queued' || detail.latestJob?.status === 'running';
    if (!isDocBusy && !isJobBusy) return;

    const timer = setInterval(() => {
      void loadDetail(documentId, true);
    }, 1500);
    return () => clearInterval(timer);
  }, [documentId, detail, loadDetail]);

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
      await loadLibrary();
      navigate(appPath(`/documents/${res.document.id}`));
    } catch (err) {
      toast.show({
        kind: 'error',
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
      await loadLibrary();
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

        {loadingDetail || !detail ? (
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
                  onRefresh={() => loadDetail(detail.document.id, true)}
                />
              ) : (
                <SlideQuestionsWorkspace
                  detail={detail}
                  onRefresh={() => loadDetail(detail.document.id, true)}
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
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Study from Documents</h1>
        <p className="mt-1 text-sm text-muted">
          Upload past exam papers to get step-by-step worked answers, or upload lecture slides to
          generate practice questions.
        </p>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-fg">Document type</span>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as DocumentType)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
            >
              <option value="past_question">Past Question / Exam / Quiz</option>
              <option value="slides">Lecture Slides (PPTX / PDF)</option>
              <option value="notes">Course Notes</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-fg">Title (optional)</span>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. CSC 201 Midterm 2025"
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-fg">Course (optional)</span>
            <select
              value={uploadCourseId}
              onChange={(e) => setUploadCourseId(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
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
            className="rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-fg"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DocumentType | '')}
            className="rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-fg"
          >
            <option value="">All types</option>
            <option value="past_question">Past Questions</option>
            <option value="slides">Slides</option>
            <option value="notes">Notes</option>
          </select>
        </div>
      </div>

      {loadingList ? (
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
            <Card key={doc.id} className="flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {doc.type === 'slides' ? (
                      <Presentation className="h-4 w-4 text-primary-600" />
                    ) : (
                      <FileText className="h-4 w-4 text-primary-600" />
                    )}
                    <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.title}`}
                    onClick={() => void handleDelete(doc.id)}
                    className="rounded p-1 text-muted hover:bg-surface2 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="mt-2 font-medium text-fg line-clamp-1">{doc.title}</h3>
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

