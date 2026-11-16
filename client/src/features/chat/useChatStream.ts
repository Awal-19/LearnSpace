import { useCallback, useRef, useState } from 'react';
import { API_BASE_URL, ApiError, getAccessToken } from '../../lib/apiClient';
import type { AiAction, MessageAttachment, RagSource } from './chatApi';

export interface StreamHandlers {
  onMeta?: (data: {
    userMessageId: string;
    assistantMessageId: string;
    sources?: RagSource[];
    attachments?: MessageAttachment[];
  }) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: {
    messageId: string;
    usage: { inputTokens: number; outputTokens: number };
    title?: string;
  }) => void;
  onError?: (code: string, message: string) => void;
}

export interface SendStreamParams {
  conversationId: string;
  content: string;
  action?: AiAction | null;
  selection?: string;
  attachmentIds?: string[];
  handlers: StreamHandlers;
}

/**
 * Parses an SSE chunk buffer into complete events and returns any trailing incomplete block.
 */
export function parseSseEvents(buffer: string): {
  events: Array<{ event: string; data: string }>;
  rest: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async ({
      conversationId,
      content,
      action = null,
      selection,
      attachmentIds = [],
      handlers,
    }: SendStreamParams) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const token = getAccessToken();
        const response = await fetch(
          `${API_BASE_URL}/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              content,
              action,
              ...(selection ? { selection } : {}),
              ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          let code = 'UNKNOWN';
          let message = 'Could not send message.';
          try {
            const payload = (await response.json()) as {
              error?: { code?: string; message?: string };
            };
            code = payload.error?.code ?? code;
            message = payload.error?.message ?? message;
          } catch {
            /* ignore */
          }
          throw new ApiError(response.status, code, message);
        }

        if (!response.body) {
          throw new ApiError(500, 'STREAM_ERROR', 'Response stream unavailable');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseEvents(buffer);
          buffer = rest;

          for (const evt of events) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(evt.data);
            } catch {
              continue;
            }
            if (evt.event === 'meta') {
              handlers.onMeta?.(
                parsed as {
                  userMessageId: string;
                  assistantMessageId: string;
                  sources?: RagSource[];
                  attachments?: MessageAttachment[];
                },
              );
            } else if (evt.event === 'delta') {
              handlers.onDelta?.((parsed as { text: string }).text);
            } else if (evt.event === 'done') {
              handlers.onDone?.(
                parsed as {
                  messageId: string;
                  usage: { inputTokens: number; outputTokens: number };
                  title?: string;
                },
              );
            } else if (evt.event === 'error') {
              const errObj = parsed as { code?: string; message?: string };
              handlers.onError?.(
                errObj.code ?? 'AI_PROVIDER_ERROR',
                errObj.message ?? 'The AI service encountered an error.',
              );
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiError) {
          handlers.onError?.(err.code, err.message);
        } else {
          handlers.onError?.('NETWORK_ERROR', 'Connection lost while streaming.');
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [],
  );

  return { isStreaming, send, stop };
}

