import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Menu,
  MessageSquarePlus,
  PanelLeftOpen,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useInRouterContext, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Button, ErrorState, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import { listCourses } from '../courses/coursesApi';
import {
  createConversation,
  deleteChatAttachment,
  deleteConversation,
  deleteDocument,
  getConversation,
  listConversations,
  listDocuments,
  renameConversation,
  updateConversation,
  uploadChatAttachment,
  uploadLecturePdf,
  type AiAction,
  type ChatMessage,
  type Conversation,
} from './chatApi';
import { Composer, type DraftAttachment } from './Composer';
import { ConversationList } from './ConversationList';
import { prepareImageForUpload } from './imagePrep';
import { MessageList } from './MessageList';
import {
  createTrackedBlobUrl,
  registerAttachmentPreview,
  revokeTrackedBlobUrl,
} from './previewCache';
import { useChatStream } from './useChatStream';

interface ChatPageViewProps {
  routeConversationId?: string | null;
  onNavigateConversation?: (conversationId: string | null) => void;
  initialPrefill?: string;
  initialCourseId?: string | null;
}

function ChatPageView({
  routeConversationId = null,
  onNavigateConversation,
  initialPrefill,
  initialCourseId = null,
}: ChatPageViewProps) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [pendingCourseId, setPendingCourseId] = useState<string>(initialCourseId ?? '');
  const [prefillText, setPrefillText] = useState<string | undefined>(initialPrefill);
  const [activeId, setActiveId] = useState<string | null>(routeConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<{ content: string; action: AiAction | null } | null>(
    null,
  );

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  draftAttachmentsRef.current = draftAttachments;

  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
  const loadedConvIdRef = useRef<string | null>(null);
  const manualBlankRef = useRef(
    Boolean(!routeConversationId && (initialPrefill || initialCourseId)),
  );
  const isSendingRef = useRef(false);
  const pendingCreateRef = useRef<Promise<string | null> | null>(null);
  const pendingCourseIdRef = useRef(pendingCourseId);
  pendingCourseIdRef.current = pendingCourseId;
  const courseFilterRef = useRef(courseFilter);
  courseFilterRef.current = courseFilter;
  const lastRouteConvIdRef = useRef<string | null>(routeConversationId);
  const pendingRouteTargetRef = useRef<string | null | undefined>(undefined);
  const onNavigateRef = useRef(onNavigateConversation);
  onNavigateRef.current = onNavigateConversation;

  const navigateToConversation = useCallback((id: string | null) => {
    if (!onNavigateRef.current) return;
    pendingRouteTargetRef.current = id;
    onNavigateRef.current(id);
  }, []);

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const controllers = abortControllersRef.current;

    return () => {
      for (const ctrl of controllers.values()) ctrl.abort();
      controllers.clear();
      for (const att of draftAttachmentsRef.current) {
        revokeTrackedBlobUrl(att.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (initialPrefill) setPrefillText(initialPrefill);
  }, [initialPrefill]);

  useEffect(() => {
    if (initialCourseId) setPendingCourseId(initialCourseId);
  }, [initialCourseId]);

  const { isStreaming, send, stop } = useChatStream();
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // Respond only to external URL changes (browser back/forward or links from Dashboard)
  useEffect(() => {
    if (pendingRouteTargetRef.current !== undefined) {
      if (routeConversationId === pendingRouteTargetRef.current) {
        pendingRouteTargetRef.current = undefined;
        lastRouteConvIdRef.current = routeConversationId;
      }
      return;
    }

    if (routeConversationId !== lastRouteConvIdRef.current) {
      lastRouteConvIdRef.current = routeConversationId;
      if (routeConversationId && routeConversationId !== activeIdRef.current) {
        manualBlankRef.current = false;
        loadedConvIdRef.current = null;
        setMessages([]);
        setActiveId(routeConversationId);
      }
    }
  }, [routeConversationId]);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const listQuery = useQuery({
    queryKey: ['conversations', search, courseFilter],
    queryFn: () => listConversations(search, courseFilter),
  });

  const docsQuery = useQuery({
    queryKey: ['ai', 'documents'],
    queryFn: listDocuments,
  });

  const convQuery = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => getConversation(activeId!),
    enabled: Boolean(activeId),
    refetchOnWindowFocus: false,
  });

  // Auto-select most recent conversation only on initial load without explicit selection
  useEffect(() => {
    const first = listQuery.data?.items[0];
    if (!activeId && !manualBlankRef.current && first) {
      loadedConvIdRef.current = null;
      setActiveId(first.id);
    }
  }, [activeId, listQuery.data]);

  // Hydrate messages from server ONLY when switching conversations / initial load,
  // never clobbering optimistic or actively streamed local messages.
  useEffect(() => {
    const data = convQuery.data;
    if (!data) return;
    if (data.conversation.id !== activeIdRef.current) return;
    if (isStreamingRef.current || isSendingRef.current) return;
    if (loadedConvIdRef.current === data.conversation.id) return;

    loadedConvIdRef.current = data.conversation.id;
    setMessages(data.messages);
  }, [convQuery.data, activeId]);

  useEffect(() => {
    if (
      convQuery.isError &&
      convQuery.error instanceof ApiError &&
      convQuery.error.status === 404
    ) {
      loadedConvIdRef.current = null;
      setActiveId(null);
      setMessages([]);
      navigateToConversation(null);
    }
  }, [convQuery.isError, convQuery.error, navigateToConversation]);

  const syncConversationCaches = useCallback(
    (
      convId: string,
      nextMessages: ChatMessage[],
      meta?: { title?: string; updatedAt?: string },
    ) => {
      const existingConvDetail = qc.getQueryData<{
        conversation: Conversation;
        messages: ChatMessage[];
        hasMore: boolean;
      }>(['conversation', convId]);

      if (existingConvDetail) {
        qc.setQueryData(['conversation', convId], {
          ...existingConvDetail,
          conversation: {
            ...existingConvDetail.conversation,
            ...(meta?.title ? { title: meta.title } : {}),
            ...(meta?.updatedAt ? { updatedAt: meta.updatedAt } : {}),
          },
          messages: nextMessages,
        });
      }

      qc.setQueriesData<{ items: Conversation[]; nextCursor: string | null }>(
        { queryKey: ['conversations'] },
        (old) => {
          if (!old) return old;
          const idx = old.items.findIndex((c) => c.id === convId);
          if (idx === -1) return old;
          const current = old.items[idx]!;
          const updated: Conversation = {
            ...current,
            ...(meta?.title ? { title: meta.title } : {}),
            ...(meta?.updatedAt ? { updatedAt: meta.updatedAt } : {}),
          };
          return {
            ...old,
            items: [updated, ...old.items.filter((c) => c.id !== convId)],
          };
        },
      );
    },
    [qc],
  );

  const registerCreatedConversation = useCallback(
    (conv: Conversation) => {
      loadedConvIdRef.current = conv.id;
      manualBlankRef.current = false;

      qc.setQueryData(['conversation', conv.id], {
        conversation: conv,
        messages: messagesRef.current,
        hasMore: false,
      });

      const upsertListCache = (
        old: { items: Conversation[]; nextCursor: string | null } | undefined,
      ) => {
        if (!old) return { items: [conv], nextCursor: null };
        return {
          ...old,
          items: [conv, ...old.items.filter((c) => c.id !== conv.id)],
        };
      };

      qc.setQueryData<{ items: Conversation[]; nextCursor: string | null }>(
        ['conversations', '', ''],
        upsertListCache,
      );
      const cf = courseFilterRef.current;
      if (cf && ((cf === 'none' && !conv.courseId) || (cf !== 'none' && conv.courseId === cf))) {
        qc.setQueryData<{ items: Conversation[]; nextCursor: string | null }>(
          ['conversations', '', cf],
          upsertListCache,
        );
      }

      setActiveId(conv.id);
      navigateToConversation(conv.id);
    },
    [qc, navigateToConversation],
  );

  const handleCreate = async () => {
    stop();
    setIsCreating(true);
    try {
      const createCourseId =
        pendingCourseIdRef.current ||
        (courseFilterRef.current && courseFilterRef.current !== 'none'
          ? courseFilterRef.current
          : '');
      const conv = await (createCourseId
        ? createConversation({ courseId: createCourseId })
        : createConversation());
      messagesRef.current = [];
      setMessages([]);
      registerCreatedConversation(conv);
      setSidebarOpen(false);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not start chat',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCourseTagChange = async (nextCourseId: string) => {
    const id = activeIdRef.current;
    if (!id) {
      setPendingCourseId(nextCourseId);
      return;
    }
    try {
      const updated = await updateConversation(id, { courseId: nextCourseId || null });
      qc.setQueryData<{
        conversation: Conversation;
        messages: ChatMessage[];
        hasMore: boolean;
      }>(['conversation', id], (old) => (old ? { ...old, conversation: updated } : old));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['conversations'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({ kind: 'success', title: 'Chat course updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update course',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await renameConversation(id, title);
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      await qc.invalidateQueries({ queryKey: ['conversation', id] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Rename failed',
        description: err instanceof ApiError ? err.message : 'Could not rename chat.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (activeIdRef.current === id) {
        stop();
        manualBlankRef.current = true;
        loadedConvIdRef.current = null;
        setActiveId(null);
        setMessages([]);
        navigateToConversation(null);
      }
      await deleteConversation(id);
      qc.removeQueries({ queryKey: ['conversation', id] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['conversations'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Could not delete chat.',
      });
    }
  };

  const handlePdfSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      toast.show({
        kind: 'error',
        title: 'Invalid file',
        description: 'Please upload a PDF file.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.show({
        kind: 'error',
        title: 'File too large',
        description: 'PDFs must be 10 MB or smaller.',
      });
      return;
    }
    setUploadingPdf(true);
    try {
      const targetCourseId =
        (activeIdRef.current
          ? (convQuery.data?.conversation.courseId ??
            listQuery.data?.items.find((c) => c.id === activeIdRef.current)?.courseId)
          : pendingCourseIdRef.current) || null;
      await uploadLecturePdf(file, targetCourseId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ai', 'documents'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({
        kind: 'success',
        title: 'Lecture notes uploaded',
        description: `${file.name} is ready for RAG.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'PDF upload failed',
        description: err instanceof ApiError ? err.message : 'Could not process PDF.',
      });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await deleteDocument(id);
      await qc.invalidateQueries({ queryKey: ['ai', 'documents'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not remove PDF',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const ensureConversation = useCallback(
    async (forceNew = false): Promise<string | null> => {
      if (activeIdRef.current && !forceNew) return activeIdRef.current;
      if (pendingCreateRef.current && !forceNew) return pendingCreateRef.current;

      const task = (async () => {
        try {
          const createCourseId =
            pendingCourseIdRef.current ||
            (courseFilterRef.current && courseFilterRef.current !== 'none'
              ? courseFilterRef.current
              : '');
          const conv = await (createCourseId
            ? createConversation({ courseId: createCourseId })
            : createConversation());
          registerCreatedConversation(conv);
          void qc.invalidateQueries({ queryKey: ['conversations'] });
          void qc.invalidateQueries({ queryKey: ['courses'] });
          return conv.id;
        } catch (err) {
          toast.show({
            kind: 'error',
            title: 'Could not start chat',
            description: err instanceof ApiError ? err.message : 'Please try again.',
          });
          return null;
        } finally {
          pendingCreateRef.current = null;
        }
      })();

      if (!forceNew) {
        pendingCreateRef.current = task;
      }
      return task;
    },
    [qc, registerCreatedConversation, toast],
  );

  const uploadSingleAttachment = useCallback(
    async (localId: string, fileToUpload: File, initialConvId: string, previewUrl?: string) => {
      const controller = new AbortController();
      abortControllersRef.current.set(localId, controller);

      let convId = initialConvId;
      try {
        const updateProgress = (progress: number) => {
          setDraftAttachments((prev) =>
            prev.map((a) => (a.localId === localId ? { ...a, progress } : a)),
          );
        };
        let uploaded;
        try {
          uploaded = await uploadChatAttachment(convId, fileToUpload, {
            onProgress: updateProgress,
            signal: controller.signal,
          });
        } catch (firstErr) {
          if (firstErr instanceof ApiError && firstErr.status === 404) {
            const freshId = await ensureConversation(true);
            if (!freshId) throw firstErr;
            convId = freshId;
            uploaded = await uploadChatAttachment(freshId, fileToUpload, {
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else {
            throw firstErr;
          }
        }
        if (previewUrl) {
          registerAttachmentPreview(uploaded.id, previewUrl);
        }
        setDraftAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, file: fileToUpload, progress: 100, status: 'ready', uploaded }
              : a,
          ),
        );
        if (uploaded.truncated) {
          toast.show({
            kind: 'info',
            title: 'Document truncated',
            description: `${uploaded.originalName} was large, so only the first section will be sent.`,
          });
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        const msg = err instanceof ApiError ? err.message : 'Upload failed';
        setDraftAttachments((prev) =>
          prev.map((a) => (a.localId === localId ? { ...a, status: 'error', error: msg } : a)),
        );
      } finally {
        abortControllersRef.current.delete(localId);
      }
    },
    [ensureConversation, toast],
  );

  const handleFilesSelected = async (rawFiles: File[]) => {
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email address to upload attachments.',
      });
      return;
    }

    const remainingSlots = Math.max(0, 5 - draftAttachments.length);
    if (remainingSlots === 0) {
      toast.show({ kind: 'info', title: 'Maximum 5 attachments per message' });
      return;
    }

    const filesToProcess = rawFiles.slice(0, remainingSlots);
    if (rawFiles.length > remainingSlots) {
      toast.show({ kind: 'info', title: 'Only the first 5 attachments can be added per message' });
    }

    const convId = await ensureConversation();
    if (!convId) return;

    const preparedEntries = filesToProcess.map((rawFile) => {
      const isImage =
        rawFile.type.startsWith('image/') || rawFile.name.toLowerCase().endsWith('.heic');
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = isImage ? createTrackedBlobUrl(rawFile) : undefined;
      return { localId, rawFile, isImage, previewUrl };
    });

    setDraftAttachments((prev) => [
      ...prev,
      ...preparedEntries.map(({ localId, rawFile, isImage, previewUrl }): DraftAttachment => ({
        localId,
        file: rawFile,
        previewUrl,
        kind: isImage ? 'image' : 'document',
        progress: 0,
        status: isImage ? 'preparing' : 'uploading',
        showPreparing: false,
      })),
    ]);

    const MAX_CONCURRENT_UPLOADS = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < preparedEntries.length) {
        const entry = preparedEntries[cursor];
        cursor += 1;
        if (!entry) break;
        const { localId, rawFile, isImage, previewUrl } = entry;

        let fileToUpload = rawFile;
        if (isImage) {
          const prepTimer = window.setTimeout(() => {
            setDraftAttachments((prev) =>
              prev.map((a) =>
                a.localId === localId && a.status === 'preparing'
                  ? { ...a, showPreparing: true }
                  : a,
              ),
            );
          }, 300);
          try {
            fileToUpload = await prepareImageForUpload(rawFile);
          } finally {
            window.clearTimeout(prepTimer);
          }
          if (!draftAttachmentsRef.current.some((a) => a.localId === localId)) {
            continue;
          }
          setDraftAttachments((prev) =>
            prev.map((a) =>
              a.localId === localId
                ? { ...a, file: fileToUpload, status: 'uploading', showPreparing: false }
                : a,
            ),
          );
        }

        await uploadSingleAttachment(localId, fileToUpload, convId, previewUrl);
      }
    };

    const concurrency = Math.min(MAX_CONCURRENT_UPLOADS, preparedEntries.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  };

  const handleRemoveAttachment = useCallback((localId: string) => {
    const controller = abortControllersRef.current.get(localId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(localId);
    }
    const target = draftAttachmentsRef.current.find((a) => a.localId === localId);
    revokeTrackedBlobUrl(target?.previewUrl);
    if (target?.uploaded) {
      void deleteChatAttachment(target.uploaded.id).catch(() => undefined);
    }
    setDraftAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const handleRetryAttachment = useCallback(
    async (localId: string) => {
      const target = draftAttachmentsRef.current.find((a) => a.localId === localId);
      if (!target || target.status !== 'error') return;
      const convId = await ensureConversation();
      if (!convId) return;
      setDraftAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId ? { ...a, status: 'uploading', progress: 0, error: undefined } : a,
        ),
      );
      await uploadSingleAttachment(localId, target.file, convId, target.previewUrl);
    },
    [ensureConversation, uploadSingleAttachment],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) void handleFilesSelected(files);
  };

  const handleSend = async (
    content: string,
    action: AiAction | null,
    options?: { retryFromEmptyError?: boolean },
  ) => {
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email address to chat with LearnSpace AI.',
      });
      return;
    }

    if (isSendingRef.current || isStreamingRef.current) return;
    isSendingRef.current = true;
    setIsSubmitting(true);

    try {
      const readyAttachments = draftAttachments
        .filter((a) => a.status === 'ready' && a.uploaded)
        .map((a) => a.uploaded!);
      const attachmentIds = readyAttachments.map((a) => a.id);

      for (const a of draftAttachments) {
        if (a.status !== 'ready' || !a.uploaded) {
          revokeTrackedBlobUrl(a.previewUrl);
        }
      }
      setDraftAttachments([]);

      setLastPrompt({ content, action });
      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const displayContent =
        content ||
        (action
          ? `Quick action: ${action.replace('_', ' ')}`
          : `Sent ${readyAttachments.length} attachment(s)`);

      // Immediately render user message + AI Thinking indicator before any network await
      setMessages((prev) => {
        let base = prev;
        if (
          options?.retryFromEmptyError &&
          base.length > 0 &&
          base[base.length - 1]?.status === 'error'
        ) {
          const withoutErr = base.slice(0, -1);
          const prevUser = withoutErr[withoutErr.length - 1];
          base = prevUser?.id.startsWith('temp-user-') ? withoutErr.slice(0, -1) : withoutErr;
        }
        const next: ChatMessage[] = [
          ...base,
          {
            id: tempUserId,
            role: 'user',
            content: displayContent,
            status: 'complete',
            action,
            ...(readyAttachments.length > 0 ? { attachments: readyAttachments } : {}),
            createdAt: nowIso,
          },
          {
            id: tempAssistantId,
            role: 'assistant',
            content: '',
            status: 'partial',
            action: null,
            createdAt: nowIso,
          },
        ];
        messagesRef.current = next;
        return next;
      });

      const targetId = await ensureConversation();
      if (!targetId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  status: 'error',
                  errorMessage: 'Could not start conversation. Please try again.',
                }
              : m,
          ),
        );
        return;
      }

      let currentAssistantId = tempAssistantId;

      await send({
        conversationId: targetId,
        content,
        action,
        attachmentIds,
        handlers: {
          onMeta: ({ userMessageId, assistantMessageId, sources, attachments }) => {
            currentAssistantId = assistantMessageId;
            setMessages((prev) => {
              const next = prev.map((m) => {
                if (m.id === tempUserId) {
                  return { ...m, id: userMessageId, ...(attachments ? { attachments } : {}) };
                }
                if (m.id === tempAssistantId) {
                  return { ...m, id: assistantMessageId, ...(sources ? { sources } : {}) };
                }
                return m;
              });
              messagesRef.current = next;
              syncConversationCaches(targetId, next, { updatedAt: new Date().toISOString() });
              return next;
            });
          },
          onDelta: (text) => {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === currentAssistantId ? { ...m, content: m.content + text } : m,
              );
              messagesRef.current = next;
              return next;
            });
          },
          onDone: ({ title }) => {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === currentAssistantId ? { ...m, status: 'complete' as const } : m,
              );
              messagesRef.current = next;
              syncConversationCaches(targetId, next, {
                ...(title ? { title } : {}),
                updatedAt: new Date().toISOString(),
              });
              return next;
            });
            void qc.invalidateQueries({ queryKey: ['conversations'] });
          },
          onError: (_code, message) => {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === currentAssistantId
                  ? {
                      ...m,
                      status: (m.content.length > 0 ? 'partial' : 'error') as 'partial' | 'error',
                      errorMessage: message,
                    }
                  : m,
              );
              messagesRef.current = next;
              syncConversationCaches(targetId, next);
              return next;
            });
            toast.show({ kind: 'error', title: 'AI Tutor', description: message });
          },
        },
      });
    } finally {
      isSendingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const activeConversation =
    convQuery.data?.conversation ?? listQuery.data?.items.find((c) => c.id === activeId) ?? null;
  const activeCourseId = activeId ? (activeConversation?.courseId ?? '') : pendingCourseId;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden bg-surface"
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-primary-500 bg-primary-50/85 backdrop-blur-sm dark:bg-primary-950/75">
          <p className="text-base font-semibold text-primary-700 dark:text-primary-200">
            Drop files or images to attach (up to 5)
          </p>
        </div>
      ) : null}

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <div
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-30 w-72' : 'hidden'
        } h-full md:static md:block shrink-0 transition-[width] duration-base ease-soft ${
          sidebarCollapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-[280px]'
        }`}
      >
        <ConversationList
          conversations={listQuery.data?.items ?? []}
          activeId={activeId}
          search={search}
          onSearchChange={setSearch}
          onSelect={(id) => {
            if (id === activeIdRef.current) {
              setSidebarOpen(false);
              return;
            }
            stop();
            manualBlankRef.current = false;
            loadedConvIdRef.current = null;
            setMessages([]);
            setActiveId(id);
            navigateToConversation(id);
            setSidebarOpen(false);
          }}
          onCreate={() => void handleCreate()}
          onRename={handleRename}
          onDelete={handleDelete}
          isLoading={listQuery.isLoading}
          isCreating={isCreating}
          user={user}
          courses={courses}
          courseFilter={courseFilter}
          onCourseFilterChange={setCourseFilter}
          onToggleCollapse={() => setSidebarCollapsed(true)}
          onMobileClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-surface/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Close conversations' : 'Open conversations'}
              className="rounded-xl p-1.5 text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] md:hidden"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {sidebarCollapsed ? (
              <div className="hidden items-center gap-1 md:flex">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08]"
                >
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={isCreating}
                  aria-label="New chat shortcut"
                  title="New chat"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08]"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex min-w-0 items-center gap-2.5">
              <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary-200/80 bg-primary-50 text-primary-600 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-400 sm:flex">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h1 className="truncate font-display text-sm font-semibold text-fg">
                {activeConversation?.title ?? 'AWAL · Academic AI Assistant'}
              </h1>
              {activeCourseId ? (
                <CourseBadge
                  course={courseById.get(activeCourseId)}
                  link
                  className="hidden sm:inline-flex shrink-0"
                />
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!user?.emailVerified ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Verify your email to send messages
              </span>
            ) : null}
            {courses.length > 0 ? (
              <CourseSelect
                ariaLabel="Conversation course context"
                mode="assign"
                emptyLabel="General (no course)"
                value={activeCourseId}
                onChange={(val) => void handleCourseTagChange(val)}
                courses={courses}
                className="h-8 max-w-[165px] text-xs"
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setDocsOpen((v) => !v)}
              className="rounded-xl border border-line/80 bg-surface shadow-sm hover:border-primary-300 hover:bg-primary-50/40 dark:bg-surface2"
            >
              <FileText
                className="h-4 w-4 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              Notes ({docsQuery.data?.length ?? 0})
            </Button>
            {activeId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isStreaming || isSubmitting}
                onClick={() => void handleDelete(activeId)}
                className="rounded-xl text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {docsOpen ? (
          <div className="space-y-2.5 border-b border-line/70 bg-primary-50/35 px-4 py-3.5 dark:bg-surface2/50 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-fg">
                Uploaded lecture PDFs (used automatically to ground AI answers)
              </p>
              <div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  aria-label="Upload lecture notes PDF"
                  onChange={(e) => void handlePdfSelected(e)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={uploadingPdf}
                  disabled={!user?.emailVerified}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload PDF
                </Button>
              </div>
            </div>
            {(docsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">No lecture PDFs uploaded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {docsQuery.data!.map((doc) => (
                  <div
                    key={doc.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line/80 bg-surface px-2.5 py-1 text-xs shadow-sm dark:bg-surface2"
                  >
                    <span className="max-w-[180px] truncate font-medium">{doc.filename}</span>
                    <span className="text-muted">({doc.pageCount}p)</span>
                    {doc.courseId ? <CourseBadge course={courseById.get(doc.courseId)} /> : null}
                    <button
                      type="button"
                      aria-label={`Delete ${doc.filename}`}
                      onClick={() => void handleDeleteDoc(doc.id)}
                      className="rounded p-0.5 text-muted hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {convQuery.isError && messages.length === 0 ? (
          <div className="p-6">
            <ErrorState
              title="Could not load conversation"
              message="Please try again."
              onRetry={() => void convQuery.refetch()}
            />
          </div>
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            isSubmitting={isSubmitting}
            onQuickAction={(action) => void handleSend('', action)}
            onRetryLast={() => {
              if (!lastPrompt) return;
              const lastMsg = messages[messages.length - 1];
              const isEmptyErr = lastMsg?.status === 'error' && !lastMsg.content;
              void handleSend(lastPrompt.content, lastPrompt.action, {
                retryFromEmptyError: isEmptyErr,
              });
            }}
            onContinueLast={() => void handleSend('Continue from where you stopped.', null)}
            onSelectStarterPrompt={(prompt) => void handleSend(prompt, null)}
          />
        )}

        <Composer
          disabled={!user?.emailVerified}
          isStreaming={isStreaming || isSubmitting}
          isEmptyConversation={messages.length === 0}
          attachments={draftAttachments}
          prefillText={prefillText}
          onPrefillConsumed={() => setPrefillText(undefined)}
          onFilesSelected={(files) => void handleFilesSelected(files)}
          onRemoveAttachment={handleRemoveAttachment}
          onRetryAttachment={(localId) => void handleRetryAttachment(localId)}
          onSend={(content, action) => void handleSend(content, action)}
          onStop={stop}
        />
      </div>
    </div>
  );
}

function ChatPageRouted() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const path = useAppPath();

  const routeState = location.state as
    { prefill?: string; courseId?: string | null } | null | undefined;

  const handleNavigate = useCallback(
    (nextId: string | null) => {
      navigate(path(nextId ? `/chat/${nextId}` : '/chat'), { replace: true });
    },
    [navigate, path],
  );

  return (
    <ChatPageView
      routeConversationId={conversationId ?? null}
      onNavigateConversation={handleNavigate}
      initialPrefill={routeState?.prefill}
      initialCourseId={routeState?.courseId ?? null}
    />
  );
}

export function ChatPage() {
  const inRouter = useInRouterContext();
  return inRouter ? <ChatPageRouted /> : <ChatPageView />;
}
