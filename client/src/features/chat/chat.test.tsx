import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue, type AuthUser } from '../../app/AuthContext';
import { ToastProvider } from '../../design';
import { setAccessToken } from '../../lib/apiClient';
import { ChatPage } from './ChatPage';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MarkdownContent } from './MarkdownContent';
import { MessageList } from './MessageList';
import { registerAttachmentPreview } from './previewCache';
import { parseSseEvents } from './useChatStream';

const verifiedUser: AuthUser = {
  id: 'u1',
  email: 'ama@uni.edu',
  name: 'Ama Mensah',
  emailVerified: true,
  avatarUrl: null,
};

function renderChat() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    status: 'authenticated',
    user: verifiedUser,
    setSession: vi.fn(),
    updateUser: vi.fn(),
    clearSession: vi.fn(),
    logout: vi.fn(async () => undefined),
    markEmailVerified: vi.fn(),
  };
  setAccessToken('test-token');

  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <ChatPage />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAccessToken(null);
});

describe('MarkdownContent & SSE parser', () => {
  it('T-AI-09: renders code blocks with copy button, tables, KaTeX math, and sanitizes script/javascript links', () => {
    const { container } = render(
      <MarkdownContent
        content={
          '## Calculus\n\nInline math $x^2 + 1$\n\n| Term | Meaning |\n|---|---|\n| Derivative | Rate of change |\n\n```ts\nconst x = 1;\n```\n\n<script>alert(1)</script>\n\n[Click](javascript:alert(1))'
        }
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
    const link = container.querySelector('a');
    if (link) {
      expect(link.getAttribute('href') ?? '').not.toContain('javascript:');
    }
  });

  it('parseSseEvents parses complete SSE blocks and keeps trailing partial buffer', () => {
    const raw =
      'event: meta\ndata: {"userMessageId":"u1"}\n\nevent: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"mess';
    const { events, rest } = parseSseEvents(raw);
    expect(events).toEqual([
      { event: 'meta', data: '{"userMessageId":"u1"}' },
      { event: 'delta', data: '{"text":"Hi"}' },
    ]);
    expect(rest).toBe('event: done\ndata: {"mess');
  });
});

describe('ChatPage', () => {
  it('loads conversations and streams an AI reply', async () => {
    const sseStream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode(
            'event: meta\ndata: {"userMessageId":"m1","assistantMessageId":"m2"}\n\n',
          ),
        );
        controller.enqueue(enc.encode('event: delta\ndata: {"text":"Binary search runs in O(log n)."}\n\n'));
        controller.enqueue(
          enc.encode(
            'event: done\ndata: {"messageId":"m2","usage":{"inputTokens":10,"outputTokens":12}}\n\n',
          ),
        );
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/conversations')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'c1',
                title: 'Algorithms',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            nextCursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/ai/usage')) {
        return new Response(
          JSON.stringify({
            day: '2026-11-16',
            tokensUsed: 100,
            tokenLimit: 100000,
            requestsPerMinute: 20,
            resetsAt: '2026-11-17T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/ai/documents')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/conversations/c1')) {
        return new Response(
          JSON.stringify({
            conversation: {
              id: 'c1',
              title: 'Algorithms',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            messages: [],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/conversations/c1/messages')) {
        return new Response(sseStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    renderChat();

    expect(await screen.findByText('Algorithms', { selector: 'h1' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message to AWAL'), 'Explain binary search');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText('Binary search runs in O(log n).')).toBeInTheDocument();
    });
  });

  it('shows attachment previews and contextual quick-action chips in Composer', () => {
    const file = new File(['hello'], 'lecture.pdf', { type: 'application/pdf' });
    render(
      <Composer
        isStreaming={false}
        attachments={[
          {
            localId: '1',
            file,
            kind: 'document',
            progress: 100,
            status: 'ready',
          },
        ]}
        onFilesSelected={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText('lecture.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explain this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solve this problem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz me on this' })).toBeInTheDocument();
  });

  it('keeps failed attachments visible with a Retry button and triggers onRetryAttachment', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    render(
      <Composer
        isStreaming={false}
        attachments={[
          {
            localId: 'err-1',
            file,
            previewUrl: 'blob:http://localhost/err-1',
            kind: 'image',
            progress: 40,
            status: 'error',
            error: 'Network timeout',
          },
        ]}
        onFilesSelected={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onRetryAttachment={onRetry}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Retry photo.jpg' });
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith('err-1');
  });

  it('renders sent image attachment immediately from previewCache without Loading flash', () => {
    registerAttachmentPreview('att-cached-1', 'blob:http://localhost/cached-photo');
    render(
      <MessageList
        messages={[
          {
            id: 'm1',
            role: 'user',
            content: 'Check this',
            status: 'complete',
            action: null,
            createdAt: new Date().toISOString(),
            attachments: [
              {
                id: 'att-cached-1',
                kind: 'image',
                originalName: 'notes-photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                truncated: false,
                createdAt: new Date().toISOString(),
                url: '/api/v1/ai/attachments/att-cached-1/content',
              },
            ],
          },
        ]}
        isStreaming={false}
        onQuickAction={vi.fn()}
        onRetryLast={vi.fn()}
      />,
    );

    const img = screen.getByAltText('notes-photo.jpg') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe('blob:http://localhost/cached-photo');
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('displays Unlimited when daily AI tokenLimit is null', () => {
    render(
      <ConversationList
        conversations={[]}
        activeId={null}
        search=""
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        isLoading={false}
        isCreating={false}
        usage={{
          day: '2026-11-17',
          tokensUsed: 15420,
          tokenLimit: null,
          requestsPerMinute: 20,
          resetsAt: '2026-11-18T00:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/15,420 · Unlimited/)).toBeInTheDocument();
  });
});

