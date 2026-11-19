import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { createLogger } from '../../lib/logger';
import { acquireAiConcurrency, enforceAiQuota } from './aiQuota';

type Logger = ReturnType<typeof createLogger>;

const execFileAsync = promisify(execFile);

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_AUDIO_DURATION_SECONDS = 120; // 2 minutes
const ESTIMATED_STT_USD_PER_MINUTE = 0.006;

export type DetectedAudioMime =
  'audio/webm' | 'audio/mp4' | 'audio/ogg' | 'audio/wav' | 'audio/mpeg';

/**
 * Inspects file magic bytes to verify the upload is genuine audio and not a spoofed file.
 */
export function detectAudioMime(buffer: Buffer): DetectedAudioMime | null {
  if (buffer.length < 12) return null;

  // WebM / Matroska EBML header: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }
  // Ogg container: "OggS"
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }
  // WAV RIFF....WAVE
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }
  // MP4 / M4A ISO Base Media: ....ftyp
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'audio/mp4';
  }
  // MP3 ID3 tag or MPEG frame sync
  if (
    buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
    (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }
  return null;
}

function extFromDetectedMime(mime: DetectedAudioMime): string {
  switch (mime) {
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'webm';
  }
}

export interface ConvertedAudio {
  wavBuffer: Buffer;
  durationSeconds: number;
}

/**
 * Converts uploaded browser audio (webm/mp4/ogg/mp3/wav) into 16-bit mono 16kHz PCM WAV
 * using ffmpeg in a temporary file pair that is always deleted immediately in finally.
 */
export async function convertAudioToWav16kMono(
  buffer: Buffer,
  detectedMime: DetectedAudioMime,
): Promise<ConvertedAudio> {
  const id = randomUUID();
  const inPath = join(tmpdir(), `ls-stt-in-${id}.${extFromDetectedMime(detectedMime)}`);
  const outPath = join(tmpdir(), `ls-stt-out-${id}.wav`);

  try {
    await writeFile(inPath, buffer);
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', inPath, '-vn', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000', outPath],
      { timeout: 25_000 },
    );
    const wavBuffer = await readFile(outPath);
    if (wavBuffer.length <= 44) {
      throw new AppError('VALIDATION_ERROR', 'Audio recording appears to be empty.');
    }
    const pcmBytes = wavBuffer.length - 44;
    const durationSeconds = Math.max(1, Math.round(pcmBytes / (16_000 * 2)));
    return { wavBuffer, durationSeconds };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new AppError(
        'AI_UNAVAILABLE',
        'Audio transcoding is unavailable on this server right now.',
      );
    }
    throw new AppError('VALIDATION_ERROR', 'Could not decode the uploaded audio recording.');
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => undefined),
      unlink(outPath).catch(() => undefined),
    ]);
  }
}

function resolveRivaProtoPath(): string {
  const candidates = [
    join(__dirname, 'riva_asr.proto'),
    resolve(process.cwd(), 'src/modules/ai/riva_asr.proto'),
    resolve(process.cwd(), 'server/src/modules/ai/riva_asr.proto'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error('riva_asr.proto not found');
  }
  return found;
}

interface RivaProtoStub {
  nvidia: {
    riva: {
      asr: {
        RivaSpeechRecognition: new (
          address: string,
          creds: grpc.ChannelCredentials,
        ) => {
          close?: () => void;
          Recognize: (
            req: unknown,
            metadata: grpc.Metadata,
            options: { deadline: Date },
            cb: (
              err: grpc.ServiceError | null,
              res?: {
                results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
              },
            ) => void,
          ) => void;
        };
      };
    };
  };
}

let cachedRivaClientCtor: RivaProtoStub['nvidia']['riva']['asr']['RivaSpeechRecognition'] | null =
  null;

function getRivaClientCtor() {
  if (cachedRivaClientCtor) return cachedRivaClientCtor;
  const packageDef = protoLoader.loadSync(resolveRivaProtoPath(), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDef) as unknown as RivaProtoStub;
  cachedRivaClientCtor = loaded.nvidia.riva.asr.RivaSpeechRecognition;
  return cachedRivaClientCtor;
}

async function transcribeViaNvidiaRiva(params: {
  env: Env;
  wavBuffer: Buffer;
  language: string;
  hints: string[];
}): Promise<string> {
  if (!params.env.NVIDIA_API_KEY) {
    throw new AppError('AI_UNAVAILABLE', 'Voice transcription is not configured on the server.');
  }
  const ClientCtor = getRivaClientCtor();
  const client = new ClientCtor(params.env.NVIDIA_ASR_GRPC_URL, grpc.credentials.createSsl());

  const metadata = new grpc.Metadata();
  metadata.set('function-id', params.env.NVIDIA_ASR_FUNCTION_ID);
  metadata.set('authorization', `Bearer ${params.env.NVIDIA_API_KEY}`);

  // Strip 44-byte WAV header for raw LINEAR_PCM payload expected by Riva
  const pcmAudio =
    params.wavBuffer.length > 44 && params.wavBuffer.subarray(0, 4).toString('ascii') === 'RIFF'
      ? params.wavBuffer.subarray(44)
      : params.wavBuffer;

  const speechContexts =
    params.hints.length > 0 ? [{ phrases: params.hints.slice(0, 25), boost: 10 }] : [];

  return new Promise<string>((resolvePromise, rejectPromise) => {
    const deadline = new Date(Date.now() + 30_000);
    client.Recognize(
      {
        config: {
          encoding: 'LINEAR_PCM',
          sample_rate_hertz: 16000,
          audio_channel_count: 1,
          language_code: params.language.startsWith('en') ? 'en-US' : params.language,
          max_alternatives: 1,
          enable_automatic_punctuation: true,
          enable_word_time_offsets: false,
          speech_contexts: speechContexts,
        },
        audio: pcmAudio,
      },
      metadata,
      { deadline },
      (err, response) => {
        client.close?.();
        if (err) {
          rejectPromise(err);
          return;
        }
        const transcript = (response?.results ?? [])
          .map((r) => r.alternatives?.[0]?.transcript ?? '')
          .join(' ')
          .trim();
        resolvePromise(transcript);
      },
    );
  });
}

async function transcribeViaOpenAiHttp(params: {
  env: Env;
  wavBuffer: Buffer;
  language: string;
  hints: string[];
}): Promise<string> {
  if (!params.env.STT_HTTP_URL || !params.env.STT_HTTP_API_KEY) {
    throw new AppError('AI_UNAVAILABLE', 'HTTP transcription provider is not configured.');
  }
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(params.wavBuffer)], { type: 'audio/wav' }),
    'audio.wav',
  );
  form.append('model', params.env.STT_HTTP_MODEL);
  form.append('language', params.language.split('-')[0] || 'en');
  if (params.hints.length > 0) {
    form.append('prompt', `Academic terms: ${params.hints.slice(0, 20).join(', ')}`);
  }

  const res = await fetch(params.env.STT_HTTP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.env.STT_HTTP_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new AppError('AI_UNAVAILABLE', 'Transcription provider returned an error.');
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

async function transcribeViaGemini(params: {
  env: Env;
  audioBuffer: Buffer;
  mimeType: string;
  language: string;
  hints: string[];
}): Promise<string> {
  if (!params.env.GEMINI_API_KEY) {
    throw new AppError('AI_UNAVAILABLE', 'Gemini transcription fallback is not configured.');
  }
  const hintLine =
    params.hints.length > 0
      ? ` Academic vocabulary hints: ${params.hints.slice(0, 20).join(', ')}.`
      : '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(params.env.GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Transcribe this spoken audio accurately in ${params.language}. Return ONLY the plain transcript text with punctuation and no commentary.${hintLine}`,
            },
            {
              inlineData: {
                mimeType: params.mimeType,
                data: params.audioBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new AppError('AI_UNAVAILABLE', 'Gemini transcription failed.');
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

export interface TranscribeServiceDeps {
  prisma: PrismaClient;
  env: Env;
  logger: Logger;
  convertAudio?: (buffer: Buffer, mime: DetectedAudioMime) => Promise<ConvertedAudio>;
  providerOverride?: (params: {
    provider: Env['STT_PROVIDER'];
    wavBuffer: Buffer;
    rawBuffer: Buffer;
    detectedMime: DetectedAudioMime;
    language: string;
    hints: string[];
  }) => Promise<string>;
}

export interface TranscribeResult {
  text: string;
  language: string;
  duration: number;
}

export function createTranscribeService(deps: TranscribeServiceDeps) {
  const { prisma, env, logger } = deps;
  const convertAudio = deps.convertAudio ?? convertAudioToWav16kMono;

  return {
    async transcribe(params: {
      userId: string;
      buffer: Buffer;
      reportedDuration?: number;
      language?: string;
      hints?: string[];
    }): Promise<TranscribeResult> {
      const { userId, buffer, reportedDuration } = params;
      if (!buffer || buffer.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Audio file is required.');
      }
      if (buffer.length > MAX_AUDIO_BYTES) {
        throw new AppError('PAYLOAD_TOO_LARGE', 'Audio recording must be 10 MB or smaller.');
      }
      if (
        typeof reportedDuration === 'number' &&
        Number.isFinite(reportedDuration) &&
        reportedDuration > MAX_AUDIO_DURATION_SECONDS
      ) {
        throw new AppError('VALIDATION_ERROR', 'Audio recording exceeds the 2-minute limit.');
      }

      const detectedMime = detectAudioMime(buffer);
      if (!detectedMime) {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Unsupported audio format. Please record WebM, MP4, OGG, WAV, or MP3 audio.',
        );
      }

      const releaseConcurrency = acquireAiConcurrency(userId);
      const startedAt = Date.now();
      const language = (params.language || 'en-US').slice(0, 16);
      const hints = (params.hints ?? [])
        .map((h) => h.trim())
        .filter((h) => h.length > 0 && h.length <= 60)
        .slice(0, 25);

      try {
        await enforceAiQuota(prisma, userId, env.AI_DAILY_TOKEN_LIMIT ?? null);

        // Enforce dedicated per-user daily transcription quota
        const now = new Date();
        const dayStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const maybePrisma = prisma as unknown as {
          usageEvent?: {
            count?: (args: unknown) => Promise<number>;
            aggregate?: (args: unknown) => Promise<{ _sum?: { costUsd?: number | null } }>;
            create?: (args: unknown) => Promise<unknown>;
          };
          aiUsageDaily?: {
            upsert?: (args: unknown) => Promise<unknown>;
          };
        };

        if (maybePrisma.usageEvent?.count) {
          const todayCount = await maybePrisma.usageEvent
            .count({
              where: {
                userId,
                route: '/api/v1/ai/transcribe',
                createdAt: { gte: dayStart },
              },
            })
            .catch(() => 0);
          if (todayCount >= env.AI_DAILY_TRANSCRIPTION_LIMIT) {
            throw new AppError(
              'RATE_LIMITED',
              `Daily voice transcription limit (${env.AI_DAILY_TRANSCRIPTION_LIMIT}) reached. Please type or use browser dictation.`,
            );
          }
        }

        const { wavBuffer, durationSeconds } = await convertAudio(buffer, detectedMime);
        if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Audio recording is longer than the 2-minute maximum.',
          );
        }

        let text = '';
        const modelLabel =
          env.STT_PROVIDER === 'nvidia_riva'
            ? 'nvidia/parakeet-tdt-0.6b-v2'
            : env.STT_PROVIDER === 'openai_http'
              ? env.STT_HTTP_MODEL
              : 'gemini-2.0-flash';

        if (deps.providerOverride) {
          text = await deps.providerOverride({
            provider: env.STT_PROVIDER,
            wavBuffer,
            rawBuffer: buffer,
            detectedMime,
            language,
            hints,
          });
        } else if (env.STT_PROVIDER === 'nvidia_riva') {
          text = await transcribeViaNvidiaRiva({ env, wavBuffer, language, hints });
        } else if (env.STT_PROVIDER === 'openai_http') {
          text = await transcribeViaOpenAiHttp({ env, wavBuffer, language, hints });
        } else {
          text = await transcribeViaGemini({
            env,
            audioBuffer: buffer,
            mimeType: detectedMime,
            language,
            hints,
          });
        }

        const costUsd = Number(((durationSeconds / 60) * ESTIMATED_STT_USD_PER_MINUTE).toFixed(6));
        const durationMs = Date.now() - startedAt;

        if (maybePrisma.usageEvent?.create) {
          await maybePrisma.usageEvent
            .create({
              data: {
                userId,
                feature: 'chat',
                model: modelLabel,
                tokensIn: 0,
                tokensOut: 0,
                costUsd,
                durationMs,
                status: 'success',
                route: '/api/v1/ai/transcribe',
              },
            })
            .catch(() => undefined);
        }

        if (maybePrisma.aiUsageDaily?.upsert) {
          await maybePrisma.aiUsageDaily
            .upsert({
              where: { userId_day: { userId, day: dayStart } },
              create: { userId, day: dayStart, inputTokens: 0, outputTokens: 0, requests: 1 },
              update: { requests: { increment: 1 } },
            })
            .catch(() => undefined);
        }

        // Spending/usage alert check (never logs transcript text)
        if (maybePrisma.usageEvent?.aggregate) {
          const agg = await maybePrisma.usageEvent
            .aggregate({
              where: { route: '/api/v1/ai/transcribe', createdAt: { gte: dayStart } },
              _sum: { costUsd: true },
            })
            .catch(() => null);
          const totalTodayUsd = agg?._sum?.costUsd ?? 0;
          if (totalTodayUsd >= env.AI_TRANSCRIPTION_COST_ALERT_USD) {
            logger.warn(
              { totalTodayUsd, thresholdUsd: env.AI_TRANSCRIPTION_COST_ALERT_USD },
              'Daily voice transcription usage/cost alert threshold reached',
            );
          }
        }

        return {
          text: text.trim(),
          language,
          duration: durationSeconds,
        };
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.warn({ err, provider: env.STT_PROVIDER }, 'Voice transcription provider error');
        throw new AppError(
          'AI_UNAVAILABLE',
          'Voice transcription is temporarily unavailable. Please try again or type your message.',
        );
      } finally {
        releaseConcurrency();
      }
    },
  };
}

export type TranscribeService = ReturnType<typeof createTranscribeService>;
