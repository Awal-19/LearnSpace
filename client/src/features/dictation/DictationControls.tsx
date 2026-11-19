import {
  AlertCircle,
  Loader2,
  Mic,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DICTATION_LANGUAGES } from './mathsDictation';
import type { useDictation } from './useDictation';

type DictationHook = ReturnType<typeof useDictation>;

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function DictationMicButton({
  dictation,
  disabled,
  compact = false,
}: {
  dictation: DictationHook;
  disabled?: boolean;
  compact?: boolean;
}) {
  const isListening = dictation.status === 'listening';
  const isBusy = dictation.status === 'requesting' || dictation.status === 'transcribing';
  const holdMode = dictation.prefs.holdToTalk;

  const sizeClass = compact
    ? 'h-11 w-11 min-h-[44px] min-w-[44px]'
    : 'h-11 w-11 min-h-[44px] min-w-[44px]';

  return (
    <button
      type="button"
      disabled={disabled || isBusy}
      onClick={() => {
        if (!holdMode) dictation.toggle();
      }}
      onPointerDown={() => {
        if (holdMode && dictation.status === 'idle') {
          void dictation.start();
        }
      }}
      onPointerUp={() => {
        if (holdMode && (dictation.status === 'listening' || dictation.status === 'requesting')) {
          dictation.stop();
        }
      }}
      onPointerCancel={() => {
        if (holdMode && dictation.status === 'listening') {
          dictation.stop();
        }
      }}
      aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
      aria-pressed={isListening}
      title={isListening ? 'Stop dictation' : holdMode ? 'Hold to dictate' : 'Start dictation'}
      className={`relative inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full transition-all duration-base ease-soft disabled:opacity-40 ${
        isListening
          ? 'bg-danger text-white shadow-[0_0_18px_rgba(239,68,68,0.45)] ring-4 ring-danger/25'
          : 'text-muted hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400'
      }`}
    >
      {isListening ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-danger/50 motion-safe:animate-ping"
        />
      ) : null}
      {isBusy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
      ) : isListening ? (
        <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      ) : (
        <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

export function DictationStatusBar({
  dictation,
  showSettingsToggle = true,
}: {
  dictation: DictationHook;
  showSettingsToggle?: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isListening = dictation.status === 'listening';
  const isTranscribing = dictation.status === 'transcribing';
  const isRequesting = dictation.status === 'requesting';

  const bars = [0.45, 0.85, 1.0, 0.65].map((scale, i) => {
    const pct = Math.max(
      20,
      Math.min(100, Math.round((0.18 + dictation.audioLevel * scale) * 100)),
    );
    return (
      <span
        key={i}
        className="w-1 rounded-full bg-danger transition-all duration-75"
        style={{ height: `${pct}%` }}
      />
    );
  });

  return (
    <div className="space-y-1.5">
      <div role="status" aria-live="polite" className="sr-only">
        {dictation.announcement}
      </div>

      {dictation.showPermissionPrompt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary-200/80 bg-[rgb(var(--glass-bg))] px-3.5 py-2.5 text-xs shadow-sm backdrop-blur-xl dark:border-primary-500/25">
          <p className="text-fg">
            LearnSpace uses your microphone only while you are dictating. Nothing is recorded in the
            background.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dictation.dismissPermissionPrompt}
              className="rounded-lg px-2.5 py-1 text-muted hover:bg-surface2 hover:text-fg"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => void dictation.confirmPermissionAndStart()}
              className="rounded-lg bg-primary-600 px-3 py-1 font-semibold text-white hover:bg-primary-700"
            >
              Allow microphone
            </button>
          </div>
        </div>
      ) : null}

      {isListening || isTranscribing || isRequesting ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line/70 bg-[rgb(var(--glass-bg))] px-3 py-2 text-xs shadow-sm backdrop-blur-xl dark:border-white/[0.08]">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {isListening ? (
              <>
                <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
                  {bars}
                </span>
                <span className="font-semibold text-danger">Listening...</span>
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {formatSeconds(dictation.elapsedSeconds)} / {formatSeconds(dictation.maxSeconds)}
                </span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-muted">
                  {dictation.engine === 'server' ? 'High accuracy' : 'Live'}
                </span>
                {dictation.interimText ? (
                  <span className="truncate italic text-muted">{dictation.interimText}</span>
                ) : null}
              </>
            ) : isTranscribing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" aria-hidden="true" />
                <span className="font-medium text-fg">Transcribing...</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" aria-hidden="true" />
                <span className="font-medium text-fg">Starting microphone...</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isListening ? (
              <button
                type="button"
                onClick={dictation.stop}
                className="rounded-lg bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700"
              >
                Done
              </button>
            ) : null}
            <button
              type="button"
              onClick={dictation.cancel}
              aria-label="Discard dictation"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:bg-surface2 hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {dictation.warning && !dictation.error ? (
        <p className="px-1 text-xs text-amber-600 dark:text-amber-400">{dictation.warning}</p>
      ) : null}

      {dictation.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="font-medium">{dictation.error.message}</p>
              {dictation.error.recoverySteps ? (
                <p className="text-[11px] text-fg/80">{dictation.error.recoverySteps}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {dictation.hasRetryableAudio ? (
              <button
                type="button"
                onClick={() => void dictation.retryUpload()}
                className="inline-flex items-center gap-1 rounded-lg bg-danger px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            ) : null}
            <button
              type="button"
              onClick={dictation.clearError}
              aria-label="Dismiss dictation error"
              className="rounded-lg p-1 hover:bg-danger/15"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {showSettingsToggle ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-fg"
          >
            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
            <span>
              Voice:{' '}
              {DICTATION_LANGUAGES.find((l) => l.code === dictation.prefs.language)?.shortLabel ??
                'EN-GH'}
              {dictation.prefs.highAccuracy ? ' · High accuracy' : ''}
            </span>
          </button>

          {settingsOpen ? (
            <div className="w-full rounded-2xl border border-line/70 bg-[rgb(var(--glass-bg))] p-3 text-xs shadow-lg backdrop-blur-xl dark:border-white/[0.08]">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="font-medium text-muted">Dictation language</span>
                  <select
                    value={dictation.prefs.language}
                    onChange={(e) => dictation.updatePrefs({ language: e.target.value })}
                    className="h-9 w-full rounded-xl border border-line bg-surface2/60 px-2.5 text-xs text-fg focus:border-primary-500 focus:outline-none"
                  >
                    {DICTATION_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:pt-4">
                  <label className="flex items-center gap-1.5 text-fg">
                    <input
                      type="checkbox"
                      checked={dictation.prefs.highAccuracy}
                      onChange={(e) => dictation.updatePrefs({ highAccuracy: e.target.checked })}
                    />
                    <span>High accuracy</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-fg">
                    <input
                      type="checkbox"
                      checked={dictation.prefs.mathsDictation}
                      onChange={(e) => dictation.updatePrefs({ mathsDictation: e.target.checked })}
                    />
                    <span>Maths mode</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-fg">
                    <input
                      type="checkbox"
                      checked={dictation.prefs.spokenPunctuation}
                      onChange={(e) =>
                        dictation.updatePrefs({ spokenPunctuation: e.target.checked })
                      }
                    />
                    <span>Punctuation</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-fg">
                    <input
                      type="checkbox"
                      checked={dictation.prefs.holdToTalk}
                      onChange={(e) => dictation.updatePrefs({ holdToTalk: e.target.checked })}
                    />
                    <span>Hold to talk</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-fg">
                    <input
                      type="checkbox"
                      checked={dictation.prefs.autoSend}
                      onChange={(e) => dictation.updatePrefs({ autoSend: e.target.checked })}
                    />
                    <span>Auto-send</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Optional lightweight Read Aloud speaker control for AI replies. */
export function ReadAloudButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    return () => {
      if (supported && speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speaking, supported]);

  if (!supported || !text.trim()) return null;

  const toggleSpeak = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`$>]/g, ' '));
    utterance.rate = rate;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const cycleRate = () => {
    const rates = [1, 1.25, 1.5, 0.9];
    const next = rates[(rates.indexOf(rate) + 1) % rates.length] ?? 1;
    setRate(next);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggleSpeak}
        aria-label={speaking ? 'Stop reading aloud' : 'Read reply aloud'}
        title={speaking ? 'Stop reading' : 'Read aloud'}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface2 hover:text-fg"
      >
        {speaking ? (
          <Pause className="h-3 w-3 text-primary-600" aria-hidden="true" />
        ) : (
          <Volume2 className="h-3 w-3" aria-hidden="true" />
        )}
        <span>{speaking ? 'Stop' : 'Read'}</span>
      </button>
      {speaking ? (
        <button
          type="button"
          onClick={cycleRate}
          aria-label="Change reading speed"
          className="rounded px-1 py-0.5 text-[10px] font-medium text-muted hover:bg-surface2 hover:text-fg"
        >
          {rate}x
        </button>
      ) : null}
    </span>
  );
}
