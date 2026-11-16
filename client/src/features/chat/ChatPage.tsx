import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Menu, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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
  const [docsOpen, setDocsOpen] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<{ content: string; action: AiAction | null } | null>(
    null,
  );

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

    let convId = await ensureConversation();
    if (!convId) return;

    for (const rawFile of filesToProcess) {
      const isImage =
        rawFile.type.startsWith('image/') || rawFile.name.toLowerCase().endsWith('.heic');
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const prepared = isImage ? await prepareImageForUpload(rawFile) : rawFile;
      const previewUrl = isImage ? URL.createObjectURL(prepared) : undefined;

      setDraftAttachments((prev) => [
        ...prev,
        {
          localId,
          file: prepared,
          previewUrl,
          kind: isImage ? 'image' : 'document',
          progress: 0,
          status: 'uploading',
        },
      ]);

      try {
        const updateProgress = (progress: number) => {
          setDraftAttachments((prev) =>
            prev.map((a) => (a.localId === localId ? { ...a, progress } : a)),
          );
        };
        let uploaded;
        try {
          uploaded = await uploadChatAttachment(convId, prepared, updateProgress);
        } catch (firstErr) {
          if (firstErr instanceof ApiError && firstErr.status === 404) {
            const freshId = await ensureConversation(true);
            if (!freshId) throw firstErr;
            convId = freshId;
            uploaded = await uploadChatAttachment(freshId, prepared, updateProgress);
          } else {
            throw firstErr;
          }
        }
        setDraftAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId ? { ...a, progress: 100, status: 'ready', uploaded } : a,
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
        const msg = err instanceof ApiError ? err.message : 'Upload failed';
        setDraftAttachments((prev) =>
          prev.map((a) => (a.localId === localId ? { ...a, status: 'error', error: msg } : a)),
        );
      }
    }
  };

  const handleRemoveAttachment = (localId: string) => {
    const target = draftAttachments.find((a) => a.localId === localId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    if (target?.uploaded) {
      void deleteChatAttachment(target.uploaded.id).catch(() => undefined);
    }
    setDraftAttachments((prev) => prev.filter((a) => a.localId !== localId));
  };

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

    for (const a of draftAttachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
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
      className="relative flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-line bg-bg shadow-sm"
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary-500 bg-primary-50/80 dark:bg-primary-950/70">
          <p className="text-base font-semibold text-primary-700 dark:text-primary-200">
            Drop files or images to attach (up to 5)
          </p>
        </div>
      ) : null}
      <div
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-30 w-72' : 'hidden'
        } md:static md:block md:w-72 shrink-0`}
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
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Close conversations' : 'Open conversations'}
              className="rounded-md p-1.5 text-muted hover:bg-surface2 hover:text-fg md:hidden"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="truncate text-sm font-semibold text-fg">
              {convQuery.data?.conversation.title ?? 'AWAL · Academic AI Assistant'}
            </h1>
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
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {docsOpen ? (
          <div className="border-b border-line bg-surface2/60 px-4 py-3 space-y-2">
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
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs"
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
          />
        )}

        <Composer
          disabled={!user?.emailVerified}
          isStreaming={isStreaming}
          attachments={draftAttachments}
          onFilesSelected={(files) => void handleFilesSelected(files)}
          onRemoveAttachment={handleRemoveAttachment}
          onSend={(content, action) => void handleSend(content, action)}
          onStop={stop}
        />
      </div>
    </div>
  );
}

