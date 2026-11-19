import type {
  AiAction,
  Conversation,
  Message,
  MessageAttachment,
  PrismaClient,
} from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { LLMContentPart, LLMMessage, LLMProvider, TokenUsage } from '../../lib/llm/provider';
import type { StorageService } from '../../lib/storage';
import { recordUsageEvent } from '../admin/admin.logging';
import { formatRagContext, type RagService } from '../rag/rag.service';
import {
  toPublicAttachment,
  type AttachmentsService,
  type PublicAttachment,
} from './attachments.service';
import {
  buildUserPrompt,
  suggestConversationTitle,
  trimHistory,
  TUTOR_SYSTEM_PROMPT,
} from './ai.prompts';
import { isMathProblem, verifyMathAnswer } from './mathVerify';
import type {
  CreateConversationInput,
  GetConversationQuery,
  ListConversationsQuery,
  RenameConversationInput,
  SendMessageInput,
} from './ai.schemas';

export const DAILY_TOKEN_LIMIT = 100_000;
export const AI_REQUESTS_PER_MINUTE = 20;

export interface PublicConversation {
  id: string;
  title: string;
  courseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'partial' | 'error';
  action: AiAction | null;
  attachments?: PublicAttachment[];
  createdAt: Date;
}

export interface AiUsageInfo {
  day: string;
  tokensUsed: number;
  tokenLimit: number | null;
  requestsPerMinute: number;
  resetsAt: string;
}

export interface StreamSink {
  onMeta: (data: {
    userMessageId: string;
    assistantMessageId: string;
    sources?: Array<{ filename: string; section: number }>;
    attachments?: PublicAttachment[];
  }) => void;
  onDelta: (text: string) => void;
  onDone: (data: { messageId: string; usage: TokenUsage; title?: string }) => void;
  onError: (code: string, message: string) => void;
}

function toPublicConversation(c: Conversation): PublicConversation {
  return {
    id: c.id,
    title: c.title,
    courseId: (c as { courseId?: string | null }).courseId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toPublicMessage(m: Message & { attachments?: MessageAttachment[] }): PublicMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    action: m.action,
    ...(m.attachments && m.attachments.length > 0
      ? { attachments: m.attachments.map(toPublicAttachment) }
      : {}),
    createdAt: m.createdAt,
  };
}

function utcDayBounds(now: Date = new Date()): { dayDate: Date; dayStr: string; resetsAt: string } {
  const dayStr = now.toISOString().slice(0, 10);
  const dayDate = new Date(`${dayStr}T00:00:00.000Z`);
  const nextDay = new Date(dayDate.getTime() + 24 * 60 * 60 * 1000);
  return { dayDate, dayStr, resetsAt: nextDay.toISOString() };
}

export interface AiServiceDeps {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  rag?: RagService;
  attachments?: AttachmentsService;
  storage?: StorageService;
  dailyTokenLimit?: number | null;
}

export interface AiService {
  listConversations(
    userId: string,
    query: ListConversationsQuery,
  ): Promise<{ items: PublicConversation[]; nextCursor: string | null }>;
  createConversation(userId: string, input: CreateConversationInput): Promise<PublicConversation>;
  getConversation(
    userId: string,
    conversationId: string,
    query: GetConversationQuery,
  ): Promise<{ conversation: PublicConversation; messages: PublicMessage[]; hasMore: boolean }>;
  renameConversation(
    userId: string,
    conversationId: string,
    input: RenameConversationInput,
  ): Promise<PublicConversation>;
  deleteConversation(userId: string, conversationId: string): Promise<void>;
  getUsage(userId: string, now?: Date): Promise<AiUsageInfo>;
  streamMessage(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
    signal: AbortSignal,
    sink: StreamSink,
  ): Promise<void>;
}

export function createAiService({
  prisma,
  llm,
  logger,
  rag,
  attachments,
  storage,
  dailyTokenLimit = DAILY_TOKEN_LIMIT,
}: AiServiceDeps): AiService {
  async function requireOwnedConversation(userId: string, conversationId: string) {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found');
    return conv;
  }

  return {
    async listConversations(userId, query) {
      const courseFilter =
        query.courseId === 'none'
          ? { courseId: null }
          : query.courseId
            ? { courseId: query.courseId }
            : {};

      const rows = await prisma.conversation.findMany({
        where: {
          userId,
          ...courseFilter,
          ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        items: sliced.map(toPublicConversation),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
      };
    },

    async createConversation(userId, input) {
      if (input.courseId) {
        const course = await prisma.course.findFirst({ where: { id: input.courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }
      const conv = await prisma.conversation.create({
        data: {
          userId,
          title: input.title ?? 'New chat',
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        },
      });
      return toPublicConversation(conv);
    },

    async getConversation(userId, conversationId, query) {
      const conv = await requireOwnedConversation(userId, conversationId);

      let beforeCreatedAt: Date | undefined;
      if (query.before) {
        const anchor = await prisma.message.findFirst({
          where: { id: query.before, conversationId: conv.id },
          select: { createdAt: true },
        });
        if (anchor) beforeCreatedAt = anchor.createdAt;
      }

      const rows = await prisma.message.findMany({
        where: {
          conversationId: conv.id,
          ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
        },
        include: { attachments: true },
        orderBy: { createdAt: 'desc' },
        take: query.limit + 1,
      });

      const hasMore = rows.length > query.limit;
      const sliced = (hasMore ? rows.slice(0, query.limit) : rows).reverse();

      return {
        conversation: toPublicConversation(conv),
        messages: sliced.map(toPublicMessage),
        hasMore,
      };
    },

    async renameConversation(userId, conversationId, input) {
      await requireOwnedConversation(userId, conversationId);
      if (input.courseId) {
        const course = await prisma.course.findFirst({ where: { id: input.courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        },
      });
      return toPublicConversation(updated);
    },

    async deleteConversation(userId, conversationId) {
      await requireOwnedConversation(userId, conversationId);
      if (attachments) {
        await attachments.deleteConversationAttachments(conversationId);
      }
      await prisma.conversation.delete({ where: { id: conversationId } });
    },

    async getUsage(userId, now = new Date()) {
      const { dayDate, dayStr, resetsAt } = utcDayBounds(now);
      const row = await prisma.aiUsageDaily.findUnique({
        where: { userId_day: { userId, day: dayDate } },
      });
      const tokensUsed = (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0);
      return {
        day: dayStr,
        tokensUsed,
        tokenLimit: dailyTokenLimit,
        requestsPerMinute: AI_REQUESTS_PER_MINUTE,
        resetsAt,
      };
    },

    async streamMessage(userId, conversationId, input, signal, sink) {
      if (!llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI tutor is not available right now');
      }

      const conv = await requireOwnedConversation(userId, conversationId);
      const { dayDate, resetsAt } = utcDayBounds();

      const usageRow = await prisma.aiUsageDaily.findUnique({
        where: { userId_day: { userId, day: dayDate } },
      });
      const usedToday = (usageRow?.inputTokens ?? 0) + (usageRow?.outputTokens ?? 0);
      if (dailyTokenLimit !== null && dailyTokenLimit > 0 && usedToday >= dailyTokenLimit) {
        throw new AppError('AI_BUDGET_EXCEEDED', 'Daily AI token limit reached', { resetsAt });
      }

      const historyRows = await prisma.message.findMany({
        where: { conversationId: conv.id, status: { not: 'error' } },
        orderBy: { createdAt: 'asc' },
      });

      if (!input.content && input.action) {
        const hasAssistant = historyRows.some(
          (m) => m.role === 'assistant' && m.content.length > 0,
        );
        if (!hasAssistant) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Send a message first before using a quick action',
          );
        }
      }

      const attachmentIds = input.attachmentIds ?? [];
      let linkedAttachments: MessageAttachment[] = [];
      if (attachmentIds.length > 0) {
        linkedAttachments = await prisma.messageAttachment.findMany({
          where: { id: { in: attachmentIds }, userId, conversationId: conv.id },
        });
        if (linkedAttachments.length !== attachmentIds.length) {
          throw new AppError('NOT_FOUND', 'One or more attachments were not found');
        }
      }

      const displayUserContent =
        input.content ||
        (input.action
          ? `Quick action: ${input.action.replace('_', ' ')}`
          : `Sent ${linkedAttachments.length} attachment(s)`);

      const userMessage = await prisma.message.create({
        data: {
          conversationId: conv.id,
          userId,
          role: 'user',
          content: displayUserContent,
          status: 'complete',
          action: input.action,
        },
      });

      if (linkedAttachments.length > 0) {
        await prisma.messageAttachment.updateMany({
          where: { id: { in: attachmentIds }, userId },
          data: { messageId: userMessage.id },
        });
      }

      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conv.id,
          userId,
          role: 'assistant',
          content: '',
          status: 'partial',
          model: llm.modelName,
        },
      });

      const convCourseId = (conv as { courseId?: string | null }).courseId ?? null;
      const retrievedChunks =
        rag && input.content.trim().length > 0
          ? await rag.retrieveRelevantChunks(userId, input.content, 4, convCourseId)
          : [];
      const sources = retrievedChunks.map((c) => ({
        filename: c.filename,
        section: c.chunkIndex + 1,
      }));
      const publicAttachments = linkedAttachments.map(toPublicAttachment);

      sink.onMeta({
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        ...(sources.length > 0 ? { sources } : {}),
        ...(publicAttachments.length > 0 ? { attachments: publicAttachments } : {}),
      });

      const priorLlmMessages: LLMMessage[] = historyRows
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      const basePromptText = buildUserPrompt(input.content, input.action, input.selection);
      const docSections = linkedAttachments
        .filter((a) => a.kind === 'document')
        .map((a) => {
          const truncNote = a.truncated ? ' (truncated due to length)' : '';
          return `<attached_document name="${a.originalName}"${truncNote}>\n${a.extractedText || '[No extractable text found in this document]'}\n</attached_document>`;
        });
      const ragContext = formatRagContext(retrievedChunks);
      const textParts = [ragContext, ...docSections, basePromptText].filter(Boolean);
      const combinedText = textParts.join('\n\n');

      const imageAttachments = linkedAttachments.filter((a) => a.kind === 'image');
      let userLlmContent: string | LLMContentPart[] = combinedText;

      if (imageAttachments.length > 0 && storage) {
        const parts: LLMContentPart[] = [
          { type: 'text', text: combinedText || 'Please examine the attached image(s).' },
        ];
        for (const img of imageAttachments) {
          const bytes = await storage.readAttachmentBytes(img.storageKey, img.storageUrl, 'image');
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${bytes.toString('base64')}` },
          });
        }
        userLlmContent = parts;
      }

      const llmMessages = trimHistory([
        ...priorLlmMessages,
        { role: 'user', content: userLlmContent },
      ]);

      let fullText = '';
      let usage: TokenUsage | null = null;
      const startedAt = Date.now();

      const mathMode = isMathProblem(input.content);

      try {
        for await (const chunk of llm.stream(llmMessages, {
          systemPrompt: TUTOR_SYSTEM_PROMPT,
          maxOutputTokens: mathMode ? 4096 : 2048,
          signal,
        })) {
          if (signal.aborted) break;
          if (chunk.type === 'delta') {
            fullText += chunk.text;
            sink.onDelta(chunk.text);
          } else if (chunk.type === 'usage') {
            usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
          }
        }

        if (signal.aborted) {
          await prisma.message.update({
            where: { id: assistantMessage.id },
            data: { content: fullText, status: 'partial' },
          });
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { updatedAt: new Date() },
          });
          return;
        }

        if (mathMode && fullText.length > 0) {
          const check = await verifyMathAnswer(input.content, fullText);
          if (check.checked && !check.verified && check.detail) {
            try {
              const recheck = await llm.generateText(
                `Your previous solution to "${input.content}" failed an automated substitution check (${check.detail}). Re-check the algebra briefly and provide the corrected **Answer:** and **Check your answer** step in LaTeX ($...$ / $$...$$).`,
                {
                  systemPrompt: TUTOR_SYSTEM_PROMPT,
                  maxOutputTokens: 1024,
                  signal,
                },
              );
              if (recheck.text.trim()) {
                const correction = `\n\n---\n**Check your answer (re-verified):**\n\n${recheck.text.trim()}`;
                fullText += correction;
                sink.onDelta(correction);
              }
            } catch (recheckErr) {
              logger.warn({ err: recheckErr }, 'Math answer re-check failed');
            }
          }
        }

        const finalUsage: TokenUsage = usage ?? {
          inputTokens: Math.ceil(combinedText.length / 4),
          outputTokens: Math.ceil(fullText.length / 4),
        };

        let nextTitle: string | undefined;
        if (conv.title === 'New chat') {
          nextTitle = suggestConversationTitle(input.content, input.action);
        }

        await prisma.$transaction([
          prisma.message.update({
            where: { id: assistantMessage.id },
            data: {
              content: fullText,
              status: 'complete',
              inputTokens: finalUsage.inputTokens,
              outputTokens: finalUsage.outputTokens,
            },
          }),
          prisma.conversation.update({
            where: { id: conv.id },
            data: {
              ...(nextTitle ? { title: nextTitle } : {}),
              updatedAt: new Date(),
            },
          }),
          prisma.aiUsageDaily.upsert({
            where: { userId_day: { userId, day: dayDate } },
            create: {
              userId,
              day: dayDate,
              inputTokens: finalUsage.inputTokens,
              outputTokens: finalUsage.outputTokens,
              requests: 1,
            },
            update: {
              inputTokens: { increment: finalUsage.inputTokens },
              outputTokens: { increment: finalUsage.outputTokens },
              requests: { increment: 1 },
            },
          }),
        ]);

        sink.onDone({
          messageId: assistantMessage.id,
          usage: finalUsage,
          ...(nextTitle ? { title: nextTitle } : {}),
        });
        void recordUsageEvent(prisma, {
          userId,
          feature: 'chat',
          model: llm.modelName,
          tokensIn: finalUsage.inputTokens,
          tokensOut: finalUsage.outputTokens,
          durationMs: Date.now() - startedAt,
          status: 'success',
          route: '/api/v1/conversations/:id/messages',
        });
      } catch (err) {
        if (signal.aborted) {
          await prisma.message.update({
            where: { id: assistantMessage.id },
            data: { content: fullText, status: 'partial' },
          });
          return;
        }

        const code = err instanceof AppError ? err.code : 'AI_PROVIDER_ERROR';
        const message =
          err instanceof AppError ? err.message : 'The AI service had a problem. Please try again.';
        logger.warn({ err, conversationId: conv.id }, 'AI stream failed');
        void recordUsageEvent(prisma, {
          userId,
          feature: 'chat',
          model: llm.modelName,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: Date.now() - startedAt,
          status: 'error',
          errorCode: code,
          route: '/api/v1/conversations/:id/messages',
        });

        await prisma.message.update({
          where: { id: assistantMessage.id },
          data: {
            content: fullText,
            status: fullText.length > 0 ? 'partial' : 'error',
          },
        });

        sink.onError(code, message);
      }
    },
  };
}
