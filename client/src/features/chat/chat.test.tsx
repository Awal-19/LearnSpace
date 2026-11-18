import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
          enc.encode('event: meta\ndata: {"userMessageId":"m1","assistantMessageId":"m2"}\n\n'),
        );
        controller.enqueue(
          enc.encode('event: delta\ndata: {"text":"Binary search runs in O(log n)."}\n\n'),
        );
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

  it('does not display daily AI token usage or Unlimited stats in ConversationList sidebar', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    render(
      <ConversationList
        conversations={[
          {
            id: 'c1',
            title: 'Distributed Systems Notes',
            courseId: null,
            createdAt: yesterday,
            updatedAt: yesterday,
          },
        ]}
        activeId="c1"
        search=""
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        isLoading={false}
        isCreating={false}
        user={verifiedUser}
      />,
    );

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Distributed Systems Notes')).toBeInTheDocument();
    expect(screen.queryByText(/Daily AI tokens/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unlimited/i)).not.toBeInTheDocument();
  });

  it('keeps user messages and streamed AI replies visible on first message, follow-up, sidebar collapse, and reload', async () => {
    const enc = new TextEncoder();
    const makeStream = (userId: string, assistantId: string, replyText: string, title?: string) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            enc.encode(
              `event: meta\ndata: ${JSON.stringify({ userMessageId: userId, assistantMessageId: assistantId })}\n\n`,
            ),
          );
          controller.enqueue(
            enc.encode(`event: delta\ndata: ${JSON.stringify({ text: replyText })}\n\n`),
          );
          controller.enqueue(
            enc.encode(
              `event: done\ndata: ${JSON.stringify({ messageId: assistantId, usage: { inputTokens: 8, outputTokens: 12 }, ...(title ? { title } : {}) })}\n\n`,
            ),
          );
          controller.close();
        },
      });

    const persistedMessages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      status: 'complete';
      action: null;
      createdAt: string;
    }> = [];
    let convTitle = 'New chat';
    let created = false;
    let sendCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.endsWith('/conversations') && method === 'GET') {
        return new Response(
          JSON.stringify({
            items: created
              ? [
                  {
                    id: 'conv-new',
                    title: convTitle,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ]
              : [],
            nextCursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/conversations') && method === 'POST') {
        created = true;
        return new Response(
          JSON.stringify({
            id: 'conv-new',
            title: 'New chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/ai/documents')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/conversations/conv-new') && method === 'GET') {
        return new Response(
          JSON.stringify({
            conversation: {
              id: 'conv-new',
              title: convTitle,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            messages: [...persistedMessages],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/conversations/conv-new/messages') && method === 'POST') {
        sendCount += 1;
        if (sendCount === 1) {
          convTitle = 'Hi';
          persistedMessages.push(
            {
              id: 'u-1',
              role: 'user',
              content: 'Hi',
              status: 'complete',
              action: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'a-1',
              role: 'assistant',
              content: 'Hello! How can I help you study today?',
              status: 'complete',
              action: null,
              createdAt: new Date().toISOString(),
            },
          );
          return new Response(
            makeStream('u-1', 'a-1', 'Hello! How can I help you study today?', 'Hi'),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
          );
        }

        persistedMessages.push(
          {
            id: 'u-2',
            role: 'user',
            content: 'What is a noun?',
            status: 'complete',
            action: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a-2',
            role: 'assistant',
            content: 'A noun is a word that names a person, place, thing, or idea.',
            status: 'complete',
            action: null,
            createdAt: new Date().toISOString(),
          },
        );
        return new Response(
          makeStream('u-2', 'a-2', 'A noun is a word that names a person, place, thing, or idea.'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }

      return new Response('{}', { status: 404 });
    });

    const renderRoutedChat = () => {
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
              <MemoryRouter initialEntries={['/chat']}>
                <Routes>
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/chat/:conversationId" element={<ChatPage />} />
                </Routes>
              </MemoryRouter>
            </AuthContext.Provider>
          </ToastProvider>
        </QueryClientProvider>,
      );
    };

    const view = renderRoutedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    const input = screen.getByLabelText('Message to AWAL');
    await user.type(input, 'Hi');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Hi', { selector: 'p' })).toBeInTheDocument();
    expect(await screen.findByText('Hello! How can I help you study today?')).toBeInTheDocument();

    // Follow-up question stays in the same active conversation
    await user.type(screen.getByLabelText('Message to AWAL'), 'What is a noun?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(
      await screen.findByText('A noun is a word that names a person, place, thing, or idea.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hi', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('What is a noun?', { selector: 'p' })).toBeInTheDocument();

    // Collapsing and expanding sidebar preserves active conversation
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByText('Hello! How can I help you study today?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByText('What is a noun?', { selector: 'p' })).toBeInTheDocument();

    // Simulated page refresh restores full persisted conversation from backend
    view.unmount();
    renderRoutedChat();

    expect(await screen.findByText('Hello! How can I help you study today?')).toBeInTheDocument();
    expect(
      screen.getByText('A noun is a word that names a person, place, thing, or idea.'),
    ).toBeInTheDocument();
  });

  it('keeps user message visible and allows Retry when AI response fails', async () => {
    let attempts = 0;
    const enc = new TextEncoder();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.endsWith('/conversations') && method === 'GET') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'c1',
                title: 'Grammar',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            nextCursor: null,
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
      if (url.endsWith('/conversations/c1') && method === 'GET') {
        return new Response(
          JSON.stringify({
            conversation: {
              id: 'c1',
              title: 'Grammar',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            messages: [],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/conversations/c1/messages') && method === 'POST') {
        attempts += 1;
        if (attempts === 1) {
          return new Response(
            JSON.stringify({
              error: { code: 'AI_UNAVAILABLE', message: 'Tutor temporarily busy.' },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                enc.encode(
                  'event: meta\ndata: {"userMessageId":"u1","assistantMessageId":"a1"}\n\n',
                ),
              );
              controller.enqueue(enc.encode('event: delta\ndata: {"text":"Recovered reply!"}\n\n'));
              controller.enqueue(
                enc.encode(
                  'event: done\ndata: {"messageId":"a1","usage":{"inputTokens":5,"outputTokens":5}}\n\n',
                ),
              );
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    renderChat();
    const user = userEvent.setup();

    expect(await screen.findByText('Grammar', { selector: 'h1' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Message to AWAL'), 'Define verb');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Define verb', { selector: 'p' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tutor temporarily busy.');
    expect(screen.getByText('Define verb', { selector: 'p' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Recovered reply!')).toBeInTheDocument();
    expect(screen.getAllByText('Define verb')).toHaveLength(1);
  });
});
