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
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Button, ErrorState, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createConversation,
  deleteChatAttachment,
  deleteConversation,
  deleteDocument,
  getAiUsage,
  getConversation,
  listConversations,
  listDocuments,
  renameConversation,
  uploadChatAttachment,
  uploadLecturePdf,
  type AiAction,
  type ChatMessage,
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

export function ChatPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<{ content: string; action: AiAction | null } | null>(
    null,
  );
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  draftAttachmentsRef.current = draftAttachments;

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

  const { isStreaming, send, stop } = useChatStream();

  const listQuery = useQuery({
    queryKey: ['conversations', search],
    queryFn: () => listConversations(search),
  });

  const usageQuery = useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: getAiUsage,
  });

  const docsQuery = useQuery({
    queryKey: ['ai', 'documents'],
    queryFn: listDocuments,
  });

  const convQuery = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => getConversation(activeId!),
    enabled: Boolean(activeId),
  });

  useEffect(() => {
    const first = listQuery.data?.items[0];
    if (!activeId && first) {
      setActiveId(first.id);
    }
  }, [activeId, listQuery.data]);

  useEffect(() => {
    if (convQuery.data) {
      setMessages(convQuery.data.messages);
    }
  }, [convQuery.data]);

  useEffect(() => {
    if (convQuery.isError && convQuery.error instanceof ApiError && convQuery.error.status === 404) {
      setActiveId(null);
      setMessages([]);
    }
  }, [convQuery.isError, convQuery.error]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const conv = await createConversation();
      setActiveId(conv.id);
      setMessages([]);
      setSidebarOpen(false);
      await qc.invalidateQueries({ queryKey: ['conversations'] });
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
      await deleteConversation(id);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await qc.invalidateQueries({ queryKey: ['conversations'] });
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
      toast.show({ kind: 'error', title: 'Invalid file', description: 'Please upload a PDF file.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.show({ kind: 'error', title: 'File too large', description: 'PDFs must be 10 MB or smaller.' });
      return;
    }
    setUploadingPdf(true);
    try {
      await uploadLecturePdf(file);
      await qc.invalidateQueries({ queryKey: ['ai', 'documents'] });
      toast.show({ kind: 'success', title: 'Lecture notes uploaded', description: `${file.name} is ready for RAG.` });
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

  const ensureConversation = async (forceNew = false): Promise<string | null> => {
    if (activeId && !forceNew && !convQuery.isError) return activeId;
    try {
      const conv = await createConversation();
      setActiveId(conv.id);
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      return conv.id;
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not start chat',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
      return null;
    }
  };

  const uploadSingleAttachment = useCallback(
    async (
      localId: string,
      fileToUpload: File,
      initialConvId: string,
      previewUrl?: string,
    ) => {
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
          prev.map((a) =>
            a.localId === localId ? { ...a, status: 'error', error: msg } : a,
          ),
        );
      } finally {
        abortControllersRef.current.delete(localId);
      }
    },
    [toast],
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
      ...preparedEntries.map(
        ({ localId, rawFile, isImage, previewUrl }): DraftAttachment => ({
          localId,
          file: rawFile,
          previewUrl,
          kind: isImage ? 'image' : 'document',
          progress: 0,
          status: isImage ? 'preparing' : 'uploading',
          showPreparing: false,
        }),
      ),
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
          // Skip upload if the user removed this attachment while it was preparing.
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
    [uploadSingleAttachment],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) void handleFilesSelected(files);
  };

  const handleSend = async (content: string, action: AiAction | null) => {
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email address to chat with LearnSpace AI.',
      });
      return;
    }

    const targetId = await ensureConversation();
    if (!targetId) return;

    const readyAttachments = draftAttachments
      .filter((a) => a.status === 'ready' && a.uploaded)
      .map((a) => a.uploaded!);
    const attachmentIds = readyAttachments.map((a) => a.id);

    // Keep ready previewUrls registered in previewCache so MessageList renders
    // immediately without blinking; only revoke URLs of unsent/failed drafts.
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

    setMessages((prev) => [
      ...prev,
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
    ]);

    let currentAssistantId = tempAssistantId;

    await send({
      conversationId: targetId,
      content,
      action,
      attachmentIds,
      handlers: {
        onMeta: ({ userMessageId, assistantMessageId, sources, attachments }) => {
          currentAssistantId = assistantMessageId;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === tempUserId) {
                return { ...m, id: userMessageId, ...(attachments ? { attachments } : {}) };
              }
              if (m.id === tempAssistantId) {
                return { ...m, id: assistantMessageId, ...(sources ? { sources } : {}) };
              }
              return m;
            }),
          );
        },
        onDelta: (text) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantId ? { ...m, content: m.content + text } : m,
            ),
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === currentAssistantId ? { ...m, status: 'complete' } : m)),
          );
          void qc.invalidateQueries({ queryKey: ['conversations'] });
          void qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
        },
        onError: (_code, message) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantId
                ? { ...m, status: m.content.length > 0 ? 'partial' : 'error' }
                : m,
            ),
          );
          toast.show({ kind: 'error', title: 'AI Tutor', description: message });
        },
      },
    });
  };

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
      className="relative flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-black/[0.07] bg-app bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.05),_transparent_58%)] shadow-md dark:border-white/[0.08] dark:bg-[radial-gradient(ellipse_at_top,_rgba(96,165,250,0.07),_transparent_58%)] md:h-[calc(100vh-7.5rem)]"
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary-500 bg-primary-50/80 backdrop-blur-sm dark:bg-primary-950/70">
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
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <div
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-30 w-72' : 'hidden'
        } md:static md:block shrink-0 transition-[width] duration-base ease-soft ${
          sidebarCollapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-[272px]'
        }`}
      >
        <ConversationList
          conversations={listQuery.data?.items ?? []}
          activeId={activeId}
          search={search}
          onSearchChange={setSearch}
          onSelect={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
          onCreate={() => void handleCreate()}
          onRename={handleRename}
          onDelete={handleDelete}
          isLoading={listQuery.isLoading}
          isCreating={isCreating}
          usage={usageQuery.data}
          user={user}
          onToggleCollapse={() => setSidebarCollapsed(true)}
          onMobileClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/60 px-4 py-2.5 backdrop-blur-xl dark:border-white/[0.07] dark:bg-surface/60">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Close conversations' : 'Open conversations'}
              className="rounded-xl p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08] md:hidden"
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
                >
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={isCreating}
                  aria-label="New chat shortcut"
                  title="New chat"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg liquid-glass-subtle text-primary-600 dark:text-primary-400 sm:flex">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h1 className="truncate font-display text-sm font-semibold text-fg">
                {convQuery.data?.conversation.title ?? 'AWAL · Academic AI Assistant'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!user?.emailVerified ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Verify your email to send messages
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setDocsOpen((v) => !v)}
              className="rounded-xl liquid-glass-subtle"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Notes ({docsQuery.data?.length ?? 0})
            </Button>
            {activeId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isStreaming}
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
          <div className="border-b border-black/[0.06] bg-white/55 px-4 py-3 backdrop-blur-lg space-y-2 dark:border-white/[0.07] dark:bg-white/[0.03]">
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
                    className="liquid-glass-subtle inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs"
                  >
                    <span className="max-w-[180px] truncate font-medium">{doc.filename}</span>
                    <span className="text-muted">({doc.pageCount}p)</span>
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

        {convQuery.isError ? (
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
            onQuickAction={(action) => void handleSend('', action)}
            onRetryLast={() => {
              if (lastPrompt) void handleSend(lastPrompt.content, lastPrompt.action);
            }}
            onSelectStarterPrompt={(prompt) => void handleSend(prompt, null)}
          />
        )}

        <Composer
          disabled={!user?.emailVerified}
          isStreaming={isStreaming}
          attachments={draftAttachments}
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

