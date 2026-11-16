import { API_BASE_URL, ApiError, getAccessToken, request } from '../../lib/apiClient';

export type AiAction = 'explain_simple' | 'example' | 'quiz_me' | 'summarize';

export interface MessageAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'document';
  sizeBytes: number;
  truncated: boolean;
  url: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface RagSource {
  filename: string;
  section: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'partial' | 'error';
  action: AiAction | null;
  createdAt: string;
  sources?: RagSource[];
  attachments?: MessageAttachment[];
}

export interface StudyDocument {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface AiUsage {
  day: string;
  tokensUsed: number;
  tokenLimit: number;
  requestsPerMinute: number;
  resetsAt: string;
}

export function listConversations(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  const qs = params.toString();
  return request<{ items: Conversation[]; nextCursor: string | null }>(
    `/conversations${qs ? `?${qs}` : ''}`,
  );
}

export function createConversation(title?: string) {
  return request<Conversation>('/conversations', {
    method: 'POST',
    body: title ? { title } : {},
  });
}

export function getConversation(id: string) {
  return request<{ conversation: Conversation; messages: ChatMessage[]; hasMore: boolean }>(
    `/conversations/${id}`,
  );
}

export function renameConversation(id: string, title: string) {
  return request<Conversation>(`/conversations/${id}`, {
    method: 'PATCH',
    body: { title },
  });
}

export function deleteConversation(id: string) {
  return request<void>(`/conversations/${id}`, { method: 'DELETE' });
}

export function getAiUsage() {
  return request<AiUsage>('/ai/usage');
}

export function listDocuments() {
  return request<StudyDocument[]>('/ai/documents');
}

export function uploadLecturePdf(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<StudyDocument>('/ai/upload-notes', {
    method: 'POST',
    body: formData,
  });
}

export function deleteDocument(id: string) {
  return request<void>(`/ai/documents/${id}`, { method: 'DELETE' });
}

export function uploadChatAttachment(
  conversationId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MessageAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/ai/attachments`);
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}') as MessageAttachment & {
          error?: { code?: string; message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else {
          reject(
            new ApiError(
              xhr.status,
              payload.error?.code ?? 'UPLOAD_FAILED',
              payload.error?.message ?? 'Could not upload file',
            ),
          );
        }
      } catch {
        reject(new ApiError(xhr.status, 'UPLOAD_FAILED', 'Could not upload file'));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(0, 'NETWORK_ERROR', 'Upload failed due to a network error'));
    };

    const formData = new FormData();
    formData.append('conversationId', conversationId);
    formData.append('file', file);
    xhr.send(formData);
  });
}

export function deleteChatAttachment(id: string) {
  return request<void>(`/ai/attachments/${id}`, { method: 'DELETE' });
}

export async function fetchAttachmentBlob(url: string): Promise<Blob> {
  const token = getAccessToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error('Could not load attachment');
  }
  return res.blob();
}

