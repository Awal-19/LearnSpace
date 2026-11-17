import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pause, Play, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

type Mode = 'focus' | 'short' | 'long';

interface UserSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

interface StudySession {
  id: string;
  taskId: string | null;
  startedAt: string;
  durationSeconds: number;
  source: 'pomodoro' | 'manual';
}

interface Task {
  id: string;
  title: string;
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['users', 'me', 'settings'],
    queryFn: () => request<UserSettings>('/users/me/settings'),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'todo-for-focus'],
    queryFn: () => request<{ items: Task[] }>('/tasks?view=all&limit=25'),
  });

  const sessionsQuery = useQuery({
    queryKey: ['study-sessions'],
    queryFn: () => request<{ items: StudySession[]; totalSeconds: number }>('/study-sessions'),
  });

  const durations = {
    focus: (settingsQuery.data?.focusMinutes ?? 25) * 60,
    short: (settingsQuery.data?.shortBreakMinutes ?? 5) * 60,
    long: (settingsQuery.data?.longBreakMinutes ?? 15) * 60,
  };

  const [mode, setMode] = useState<Mode>('focus');
  const [remaining, setRemaining] = useState(durations.focus);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [saving, setSaving] = useState(false);

  const startedAtRef = useRef<number | null>(null);
  const targetEndRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      setRemaining(durations[mode]);
    }
  }, [settingsQuery.data?.focusMinutes, settingsQuery.data?.shortBreakMinutes, settingsQuery.data?.longBreakMinutes]);

  const logFocusSession = async (durationSec: number, startedMs: number) => {
    if (mode !== 'focus' || durationSec < 60) return;
    setSaving(true);
    try {
      await request<StudySession>('/study-sessions', {
        method: 'POST',
        body: {
          startedAt: new Date(startedMs).toISOString(),
          durationSeconds: Math.min(14400, Math.round(durationSec)),
          source: 'pomodoro',
          taskId: taskId || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ['study-sessions'] });
      await qc.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show({
        kind: 'success',
        title: 'Focus session logged',
        description: `${Math.round(durationSec / 60)} minutes added to your study stats.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not log session',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (!targetEndRef.current) return;
      const secs = Math.max(0, Math.ceil((targetEndRef.current - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        setRunning(false);
        window.clearInterval(id);
        const startedMs = startedAtRef.current ?? Date.now() - durations[mode] * 1000;
        startedAtRef.current = null;
        targetEndRef.current = null;
        void logFocusSession(durations[mode], startedMs);
        setRemaining(durations[mode]);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [running, mode]);

  const switchMode = (next: Mode) => {
    setRunning(false);
    startedAtRef.current = null;
    targetEndRef.current = null;
    setMode(next);
    setRemaining(durations[next]);
  };

  const handleStart = () => {
    const now = Date.now();
    startedAtRef.current ??= now;
    targetEndRef.current = now + remaining * 1000;
    setRunning(true);
  };

  const handlePause = () => {
    setRunning(false);
    if (targetEndRef.current) {
      setRemaining(Math.max(0, Math.ceil((targetEndRef.current - Date.now()) / 1000)));
    }
    targetEndRef.current = null;
  };

  const handleReset = () => {
    setRunning(false);
    startedAtRef.current = null;
    targetEndRef.current = null;
    setRemaining(durations[mode]);
  };

  const handleFinishEarly = async () => {
    if (mode !== 'focus') return;
    const elapsed = durations.focus - remaining;
    if (elapsed < 60) {
      toast.show({ kind: 'info', title: 'Keep going', description: 'Focus for at least 1 minute to log a session.' });
      return;
    }
    const startedMs = startedAtRef.current ?? Date.now() - elapsed * 1000;
    handleReset();
    await logFocusSession(elapsed, startedMs);
  };

  const handleDeleteSession = async (id: string) => {
    await request<void>(`/study-sessions/${id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['study-sessions'] });
    await qc.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
    await qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const totalSeconds = Math.max(1, durations[mode]);
  const pctRemaining = Math.max(0, Math.min(1, remaining / totalSeconds));
  const ringRadius = 104;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeOffset = ringCircumference * (1 - pctRemaining);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="relative overflow-hidden border-primary-200/80 bg-gradient-to-b from-primary-50/70 via-surface to-surface p-6 text-center dark:border-primary-500/20 dark:from-primary-600/10 sm:p-8 space-y-6">
        <div
          className="inline-flex justify-center gap-1 rounded-xl border border-line bg-surface2/70 p-1"
          role="tablist"
          aria-label="Timer mode"
        >
          {(
            [
              { id: 'focus', label: 'Focus' },
              { id: 'short', label: 'Short break' },
              { id: 'long', label: 'Long break' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => switchMode(m.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                mode === m.id
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="relative mx-auto flex h-60 w-60 items-center justify-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 240 240" aria-hidden="true">
            <circle
              cx="120"
              cy="120"
              r={ringRadius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-surface2"
            />
            <circle
              cx="120"
              cy="120"
              r={ringRadius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={strokeOffset}
              className="text-primary-600 transition-[stroke-dashoffset] duration-base ease-soft dark:text-primary-400"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="font-mono text-5xl font-bold tracking-tight text-fg tabular-nums sm:text-6xl"
              aria-live="off"
            >
              {formatClock(remaining)}
            </p>
            <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">
              {mode === 'focus' ? 'Deep Work' : mode === 'short' ? 'Short Break' : 'Long Break'}
            </span>
          </div>
        </div>

        {mode === 'focus' ? (
          <div className="mx-auto max-w-xs text-left">
            <label htmlFor="focus-task" className="mb-1.5 block text-xs font-medium text-muted">
              Link to task (optional)
            </label>
            <select
              id="focus-task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="">General study</option>
              {(tasksQuery.data?.items ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-center gap-3">
          {running ? (
            <Button type="button" size="lg" variant="secondary" onClick={handlePause}>
              <Pause className="h-4 w-4" aria-hidden="true" />
              Pause
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={handleStart}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Start
            </Button>
          )}
          <Button type="button" size="lg" variant="ghost" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          {mode === 'focus' ? (
            <Button
              type="button"
              size="lg"
              variant="secondary"
              loading={saving}
              onClick={() => void handleFinishEarly()}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Finish &amp; log
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">Recent focus sessions</h2>
          {sessionsQuery.data ? (
            <span className="text-sm text-muted">
              Total: {Math.round(sessionsQuery.data.totalSeconds / 60)} min
            </span>
          ) : null}
        </div>

        {sessionsQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (sessionsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={Timer}
            title="No focus sessions yet"
            description="Complete a Pomodoro session above to track your real study hours."
          />
        ) : (
          <div className="divide-y divide-line">
            {sessionsQuery.data!.items.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-fg">
                    {Math.round(s.durationSeconds / 60)} min focus
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(s.startedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete study session"
                  onClick={() => void handleDeleteSession(s.id)}
                  className="rounded p-1.5 text-muted hover:bg-surface2 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

