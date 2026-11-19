import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ApiError } from '../../lib/apiClient';
import {
  DEFAULT_DICTATION_PREFERENCES,
  loadDictationPreferences,
  saveDictationPreferences,
  transcribeAudio,
  type DictationPreferences,
} from './dictationApi';
import {
  applyMathsDictation,
  applySpokenPunctuation,
  getWhisperLanguageCode,
  insertAtCursor,
  mergeTranscriptSegment,
} from './mathsDictation';

export const MAX_DICTATION_SECONDS = 120;
export const SILENCE_WARNING_MS = 18_000;
const PERMISSION_EXPLAINED_KEY = 'learnspace:mic-explained';

export type DictationStatus = 'idle' | 'requesting' | 'listening' | 'transcribing' | 'error';
export type DictationEngine = 'browser' | 'server';

export interface DictationErrorInfo {
  code:
    | 'insecure_context'
    | 'permission_denied'
    | 'no_microphone'
    | 'microphone_busy'
    | 'network'
    | 'unsupported'
    | 'server_error';
  message: string;
  recoverySteps?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function getPermissionRecoverySteps(): string {
  if (typeof navigator === 'undefined') {
    return 'Enable microphone permission in your browser site settings and try again.';
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua)) {
    return 'iPhone Safari: tap "aA" or the lock/puzzle icon in the address bar → Website Settings → Microphone → Allow, then reload.';
  }
  if (/Android/i.test(ua)) {
    return 'Android Chrome: tap the lock/tune icon next to the URL → Permissions → Microphone → Allow.';
  }
  return 'Desktop browser: click the lock/tune icon in the address bar → Microphone → Allow, then retry.';
}

function mapMediaError(err: unknown): DictationErrorInfo {
  const name = err instanceof DOMException ? err.name : ((err as { name?: string })?.name ?? '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'permission_denied',
      message: 'Microphone access was denied.',
      recoverySteps: getPermissionRecoverySteps(),
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'no_microphone',
      message: 'No microphone was found on this device.',
      recoverySteps: 'Connect or enable a microphone and try again.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      code: 'microphone_busy',
      message: 'Your microphone is currently busy in another app.',
      recoverySteps: 'Close other apps using the mic (calls, recorder) and try again.',
    };
  }
  return {
    code: 'unsupported',
    message: 'Could not access the microphone on this browser.',
  };
}

function vibratePulse(ms = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported vibration
  }
}

export interface UseDictationOptions {
  value: string;
  onChange: (next: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  vocabularyHints?: string[];
  onAutoSend?: (finalText: string) => void;
}

export function useDictation({
  value,
  onChange,
  inputRef,
  vocabularyHints = [],
  onAutoSend,
}: UseDictationOptions) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [engine, setEngine] = useState<DictationEngine>(() =>
    getSpeechRecognitionCtor() ? 'browser' : 'server',
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<DictationErrorInfo | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [hasRetryableAudio, setHasRetryableAudio] = useState(false);
  const [prefs, setPrefs] = useState<DictationPreferences>(() =>
    typeof window !== 'undefined' ? loadDictationPreferences() : DEFAULT_DICTATION_PREFERENCES,
  );

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAutoSendRef = useRef(onAutoSend);
  onAutoSendRef.current = onAutoSend;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const hintsRef = useRef(vocabularyHints);
  hintsRef.current = vocabularyHints;

  const isListeningRef = useRef(false);
  const cancelledRef = useRef(false);
  const preDictationValueRef = useRef('');
  const cursorSnapshotRef = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });
  const committedChunkRef = useRef('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedMimeRef = useRef('audio/webm');
  const pendingUploadRef = useRef<{ blob: Blob; mimeType: string; duration: number } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const updatePrefs = useCallback((patch: Partial<DictationPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveDictationPreferences(next);
      return next;
    });
  }, []);

  const formatTranscript = useCallback((raw: string): string => {
    let text = raw.trim();
    if (!text) return '';
    if (prefsRef.current.spokenPunctuation) {
      text = applySpokenPunctuation(text);
    }
    if (prefsRef.current.mathsDictation) {
      text = applyMathsDictation(text);
    }
    return text;
  }, []);

  const commitIntoInput = useCallback(
    (rawChunk: string, triggerAutoSend = false) => {
      const formatted = formatTranscript(rawChunk);
      if (!formatted) return;

      const el = inputRef?.current;
      const start =
        cursorSnapshotRef.current.start ?? el?.selectionStart ?? valueRef.current.length;
      const end = cursorSnapshotRef.current.end ?? el?.selectionEnd ?? start;

      const { nextValue, nextCursor } = insertAtCursor(valueRef.current, formatted, start, end);
      valueRef.current = nextValue;
      cursorSnapshotRef.current = { start: nextCursor, end: nextCursor };
      onChangeRef.current(nextValue);

      requestAnimationFrame(() => {
        if (inputRef?.current) {
          inputRef.current.focus();
          try {
            inputRef.current.setSelectionRange(nextCursor, nextCursor);
          } catch {
            // Some input types do not support selectionRange
          }
        }
      });

      if (triggerAutoSend && prefsRef.current.autoSend && onAutoSendRef.current) {
        onAutoSendRef.current(nextValue);
      }
    },
    [formatTranscript, inputRef],
  );

  const stopHardwareAndTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    cancelledRef.current = false;
    setInterimText('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore already-stopped errors
      }
      recognitionRef.current = null;
      stopHardwareAndTimers();
      setStatus('idle');
      setAnnouncement('Dictation stopped');
      vibratePulse(10);
      if (prefsRef.current.autoSend && valueRef.current.trim() && onAutoSendRef.current) {
        onAutoSendRef.current(valueRef.current);
      }
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        stopHardwareAndTimers();
        setStatus('idle');
      }
      vibratePulse(10);
      return;
    }

    stopHardwareAndTimers();
    setStatus('idle');
  }, [stopHardwareAndTimers]);

  const cancel = useCallback(() => {
    isListeningRef.current = false;
    cancelledRef.current = true;
    setInterimText('');
    setWarning(null);
    setError(null);
    pendingUploadRef.current = null;
    setHasRetryableAudio(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort?.();
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    stopHardwareAndTimers();
    onChangeRef.current(preDictationValueRef.current);
    setStatus('idle');
    setAnnouncement('Dictation cancelled');
  }, [stopHardwareAndTimers]);

  const uploadRecording = useCallback(
    async (blob: Blob, mimeType: string, duration: number) => {
      setStatus('transcribing');
      setAnnouncement('Transcribing audio');
      setError(null);

      try {
        const result = await transcribeAudio({
          blob,
          mimeType,
          language: getWhisperLanguageCode(prefsRef.current.language),
          durationSeconds: duration,
          vocabularyHints: hintsRef.current,
        });
        pendingUploadRef.current = null;
        setHasRetryableAudio(false);
        if (result.text.trim()) {
          commitIntoInput(result.text, true);
          setAnnouncement('Transcription added to input');
        } else {
          setWarning('No speech was detected in that recording.');
        }
        setStatus('idle');
      } catch (err) {
        pendingUploadRef.current = { blob, mimeType, duration };
        setHasRetryableAudio(true);
        setStatus('error');
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Transcription failed due to a network error. You can retry without re-recording.';
        setError({
          code: 'server_error',
          message: msg,
        });
        setAnnouncement('Transcription failed');
      }
    },
    [commitIntoInput],
  );

  const retryUpload = useCallback(async () => {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    await uploadRecording(pending.blob, pending.mimeType, pending.duration);
  }, [uploadRecording]);

  const resetSilenceWatchdog = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = window.setTimeout(() => {
      if (!isListeningRef.current) return;
      setWarning('Dictation paused automatically after silence.');
      stop();
    }, SILENCE_WARNING_MS);
  }, [stop]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!isListeningRef.current) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          sum += data[i] ?? 0;
        }
        const normalized = Math.min(1, sum / (data.length * 80));
        setAudioLevel(normalized);
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    } catch {
      // Fallback: level stays 0 and CSS pulsing still renders
    }
  }, []);

  const startTimer = useCallback(() => {
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(secs);
      if (secs >= MAX_DICTATION_SECONDS) {
        setWarning('Reached the 2-minute dictation limit.');
        stop();
      }
    }, 500);
  }, [stop]);

  const startServerEngine = useCallback(
    async (stream: MediaStream) => {
      if (typeof MediaRecorder === 'undefined') {
        stopHardwareAndTimers();
        setStatus('error');
        setError({
          code: 'unsupported',
          message: 'Audio recording is not supported in this browser.',
        });
        return;
      }

      setEngine('server');
      chunksRef.current = [];
      const mime = pickSupportedAudioMime();
      recordedMimeRef.current = mime || 'audio/webm';
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || recordedMimeRef.current || 'audio/webm',
        });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopHardwareAndTimers();

        if (cancelledRef.current || blob.size === 0) {
          setStatus('idle');
          return;
        }
        void uploadRecording(blob, blob.type || recordedMimeRef.current, duration);
      };

      isListeningRef.current = true;
      setStatus('listening');
      setAnnouncement('Listening with high accuracy recording');
      vibratePulse(12);
      startLevelMeter(stream);
      startTimer();
      resetSilenceWatchdog();
      recorder.start(250);
    },
    [resetSilenceWatchdog, startLevelMeter, startTimer, stopHardwareAndTimers, uploadRecording],
  );

  const startBrowserEngine = useCallback(
    (stream: MediaStream | null) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return false;

      setEngine('browser');
      committedChunkRef.current = '';
      isListeningRef.current = true;
      setStatus('listening');
      setAnnouncement('Listening');
      vibratePulse(12);
      if (stream) startLevelMeter(stream);
      startTimer();
      resetSilenceWatchdog();

      const launchRecognition = () => {
        if (!isListeningRef.current) return;
        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = prefsRef.current.language;

        recognition.onresult = (event) => {
          resetSilenceWatchdog();
          let interim = '';
          let newFinal = '';

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const res = event.results[i];
            const transcript = res?.[0]?.transcript ?? '';
            if (res?.isFinal) {
              newFinal = mergeTranscriptSegment(newFinal, transcript);
            } else {
              interim = `${interim} ${transcript}`.trim();
            }
          }

          setInterimText(interim);

          if (newFinal.trim()) {
            const deduped = mergeTranscriptSegment(committedChunkRef.current, newFinal);
            // Extract only the newly added tail beyond committedChunkRef
            const prev = committedChunkRef.current.trim();
            const delta =
              prev && deduped.toLowerCase().startsWith(prev.toLowerCase())
                ? deduped.slice(prev.length).trim()
                : deduped;
            committedChunkRef.current = deduped;
            if (delta) {
              commitIntoInput(delta, false);
            }
          }
        };

        recognition.onerror = (ev) => {
          const errCode = ev.error ?? '';
          if (errCode === 'no-speech' && isListeningRef.current) {
            return;
          }
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            isListeningRef.current = false;
            recognitionRef.current = null;
            stopHardwareAndTimers();
            setStatus('error');
            setError({
              code: 'permission_denied',
              message: 'Microphone permission was blocked.',
              recoverySteps: getPermissionRecoverySteps(),
            });
            return;
          }
          if (
            (errCode === 'network' ||
              errCode === 'language-not-supported' ||
              errCode === 'audio-capture') &&
            isListeningRef.current
          ) {
            // Smooth fallback to server recording engine
            recognitionRef.current = null;
            if (mediaStreamRef.current) {
              void startServerEngine(mediaStreamRef.current);
            } else if (navigator.mediaDevices?.getUserMedia) {
              void navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((s) => {
                  mediaStreamRef.current = s;
                  return startServerEngine(s);
                })
                .catch((err) => {
                  isListeningRef.current = false;
                  stopHardwareAndTimers();
                  setStatus('error');
                  setError(mapMediaError(err));
                });
            }
          }
        };

        recognition.onend = () => {
          if (isListeningRef.current && !cancelledRef.current) {
            // Restart recognition seamlessly across natural pauses (iOS/Chrome auto-end workaround)
            window.setTimeout(() => {
              if (isListeningRef.current && !cancelledRef.current) {
                launchRecognition();
              }
            }, 120);
          } else {
            recognitionRef.current = null;
          }
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          // Ignore double-start race
        }
      };

      launchRecognition();
      return true;
    },
    [
      commitIntoInput,
      resetSilenceWatchdog,
      startLevelMeter,
      startServerEngine,
      startTimer,
      stopHardwareAndTimers,
    ],
  );

  const beginCapture = useCallback(async () => {
    setError(null);
    setWarning(null);
    setShowPermissionPrompt(false);

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setStatus('error');
      setError({
        code: 'insecure_context',
        message: 'Voice dictation requires a secure HTTPS connection.',
        recoverySteps: 'Open LearnSpace over HTTPS (or localhost) to use the microphone.',
      });
      return;
    }

    const speechCtor = getSpeechRecognitionCtor();
    const useServer = prefsRef.current.highAccuracy || !speechCtor;

    if (!navigator.mediaDevices?.getUserMedia && !speechCtor) {
      setStatus('error');
      setError({
        code: 'unsupported',
        message: 'Microphone capture is not supported in this browser.',
      });
      return;
    }

    preDictationValueRef.current = valueRef.current;
    cursorSnapshotRef.current = {
      start: inputRef?.current?.selectionStart ?? valueRef.current.length,
      end: inputRef?.current?.selectionEnd ?? valueRef.current.length,
    };
    cancelledRef.current = false;
    setStatus('requesting');

    let stream: MediaStream | null = null;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
      } catch (err) {
        if (useServer || !speechCtor) {
          setStatus('error');
          setError(mapMediaError(err));
          return;
        }
        // If getUserMedia failed solely because of permission/hardware, surface the clear error
        const mapped = mapMediaError(err);
        if (
          mapped.code === 'permission_denied' ||
          mapped.code === 'no_microphone' ||
          mapped.code === 'microphone_busy'
        ) {
          setStatus('error');
          setError(mapped);
          return;
        }
      }
    }

    try {
      window.localStorage.setItem(PERMISSION_EXPLAINED_KEY, '1');
    } catch {
      // Ignore
    }

    if (useServer && stream) {
      await startServerEngine(stream);
      return;
    }

    if (!startBrowserEngine(stream)) {
      if (stream) {
        await startServerEngine(stream);
      } else {
        setStatus('error');
        setError({
          code: 'unsupported',
          message: 'Speech recognition is unavailable in this browser.',
        });
      }
    }
  }, [inputRef, startBrowserEngine, startServerEngine]);

  const start = useCallback(async () => {
    if (status === 'listening' || status === 'requesting' || status === 'transcribing') return;

    // Show a friendly pre-permission explanation on first use if permission state is 'prompt'
    try {
      const alreadyExplained = window.localStorage.getItem(PERMISSION_EXPLAINED_KEY) === '1';
      if (!alreadyExplained && navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (perm.state === 'prompt') {
          setShowPermissionPrompt(true);
          return;
        }
      }
    } catch {
      // Permissions API not supported (e.g. Safari) — proceed directly
    }

    await beginCapture();
  }, [beginCapture, status]);

  const toggle = useCallback(() => {
    if (status === 'listening' || status === 'requesting') {
      stop();
    } else if (status !== 'transcribing') {
      void start();
    }
  }, [start, status, stop]);

  // Always stop hardware tracks on unmount or page close/navigation
  useEffect(() => {
    const onPageHide = () => {
      if (isListeningRef.current) {
        stop();
      } else {
        stopHardwareAndTimers();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      isListeningRef.current = false;
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      stopHardwareAndTimers();
    };
  }, [stop, stopHardwareAndTimers]);

  return {
    status,
    engine,
    elapsedSeconds,
    maxSeconds: MAX_DICTATION_SECONDS,
    audioLevel,
    interimText,
    warning,
    error,
    announcement,
    prefs,
    updatePrefs,
    showPermissionPrompt,
    dismissPermissionPrompt: () => setShowPermissionPrompt(false),
    confirmPermissionAndStart: beginCapture,
    hasRetryableAudio,
    retryUpload,
    start,
    stop,
    cancel,
    toggle,
    clearError: () => setError(null),
  };
}
