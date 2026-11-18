import { AlertTriangle, CheckCircle2, Plus, Target, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Input, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { calculateWhatIf, type GradingScaleConfig, type WhatIfPlanResult } from './gpaApi';

interface WhatIfPlannerPanelProps {
  scale: GradingScaleConfig;
}

export function WhatIfPlannerPanel({ scale }: WhatIfPlannerPanelProps) {
  const toast = useToast();
  const classSelectId = useId();

  const [targetMode, setTargetMode] = useState<'cgpa' | 'class'>('cgpa');
  const [targetCgpa, setTargetCgpa] = useState('3.60');
  const [targetClassLabel, setTargetClassLabel] = useState(scale.degreeClasses[0]?.label ?? '');
  const [workloadMode, setWorkloadMode] = useState<'credits' | 'courses'>('credits');
  const [remainingCredits, setRemainingCredits] = useState('15');
  const [plannedCourses, setPlannedCourses] = useState<
    Array<{ label: string; creditHours: string }>
  >([
    { label: 'Core Course 1', creditHours: '3' },
    { label: 'Core Course 2', creditHours: '3' },
  ]);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<WhatIfPlanResult | null>(null);

  useEffect(() => {
    setTargetClassLabel(scale.degreeClasses[0]?.label ?? '');
  }, [scale.id, scale.degreeClasses]);

  const handleCalculate = async (e: FormEvent) => {
    e.preventDefault();
    setCalculating(true);
    try {
      const res = await calculateWhatIf({
        ...(targetMode === 'cgpa' ? { targetCgpa: Number(targetCgpa) } : { targetClassLabel }),
        ...(workloadMode === 'credits'
          ? { remainingCredits: Math.max(0, Number(remainingCredits) || 0) }
          : {
              plannedCourses: plannedCourses
                .filter((c) => c.label.trim())
                .map((c) => ({
                  label: c.label.trim(),
                  creditHours: Math.max(0, Number(c.creditHours) || 0),
                })),
            }),
      });
      setResult(res);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Calculation failed',
        description: err instanceof ApiError ? err.message : 'Check your target and credits.',
      });
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">What do I need?</h2>
            <p className="text-xs text-muted">
              Plan remaining semesters on your {scale.maxGpa.toFixed(1)} scale
            </p>
          </div>
        </div>

        <form onSubmit={handleCalculate} className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-fg">Target goal</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface2 p-1">
              <button
                type="button"
                onClick={() => setTargetMode('cgpa')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  targetMode === 'cgpa' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Target CGPA
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('class')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  targetMode === 'class' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Degree class
              </button>
            </div>

            {targetMode === 'cgpa' ? (
              <Input
                label={`Desired CGPA (max ${scale.maxGpa.toFixed(1)})`}
                type="number"
                min={0}
                max={scale.maxGpa}
                step={0.05}
                value={targetCgpa}
                onChange={(e) => setTargetCgpa(e.target.value)}
                required
              />
            ) : (
              <div>
                <label htmlFor={classSelectId} className="mb-1.5 block text-xs font-medium text-fg">
                  Target class of degree
                </label>
                <select
                  id={classSelectId}
                  value={targetClassLabel}
                  onChange={(e) => setTargetClassLabel(e.target.value)}
                  className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
                >
                  {scale.degreeClasses.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label} (≥ {c.minGpa.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-fg">Remaining workload</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface2 p-1">
              <button
                type="button"
                onClick={() => setWorkloadMode('credits')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  workloadMode === 'credits'
                    ? 'bg-surface text-primary-600 shadow-sm'
                    : 'text-muted'
                }`}
              >
                Total credits
              </button>
              <button
                type="button"
                onClick={() => setWorkloadMode('courses')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  workloadMode === 'courses'
                    ? 'bg-surface text-primary-600 shadow-sm'
                    : 'text-muted'
                }`}
              >
                By course
              </button>
            </div>

            {workloadMode === 'credits' ? (
              <Input
                label="Remaining credit hours"
                type="number"
                min={0}
                max={300}
                step={0.5}
                value={remainingCredits}
                onChange={(e) => setRemainingCredits(e.target.value)}
                required
              />
            ) : (
              <div className="space-y-2">
                {plannedCourses.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_76px_auto] items-center gap-2">
                    <input
                      aria-label={`Remaining course ${idx + 1}`}
                      placeholder="Course name"
                      value={c.label}
                      onChange={(e) =>
                        setPlannedCourses((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, label: e.target.value } : row,
                          ),
                        )
                      }
                      className="h-9 rounded-lg border border-line bg-bg px-2.5 text-xs text-fg"
                    />
                    <input
                      aria-label={`Remaining credits ${idx + 1}`}
                      type="number"
                      min={0}
                      max={30}
                      step={0.5}
                      value={c.creditHours}
                      onChange={(e) =>
                        setPlannedCourses((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, creditHours: e.target.value } : row,
                          ),
                        )
                      }
                      className="h-9 rounded-lg border border-line bg-bg px-2 text-xs text-fg"
                    />
                    <button
                      type="button"
                      disabled={plannedCourses.length <= 1}
                      aria-label={`Remove planned course ${idx + 1}`}
                      onClick={() => setPlannedCourses((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded p-1 text-muted hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setPlannedCourses((prev) => [
                      ...prev,
                      { label: `Course ${prev.length + 1}`, creditHours: '3' },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add planned course
                </Button>
              </div>
            )}
          </div>

          <Button type="submit" size="sm" className="w-full" loading={calculating}>
            Calculate required grades
          </Button>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        {!result ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
            <Target className="mb-2.5 h-8 w-8 text-primary-500/70" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-fg">Server-verified GPA forecast</h3>
            <p className="mt-1 max-w-md text-xs text-muted">
              Enter your desired CGPA or degree class alongside your remaining credits to see the
              exact average and course grades required.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                result.possible
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
              }`}
            >
              {result.possible ? (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400"
                  aria-hidden="true"
                />
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    {result.possible
                      ? 'Target achievable'
                      : 'Target impossible with current credits'}
                  </p>
                  {result.targetClassLabel ? (
                    <Badge tone={result.possible ? 'success' : 'danger'}>
                      {result.targetClassLabel} (≥ {result.targetCgpa.toFixed(2)})
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed opacity-90">{result.message}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface2/45 p-3">
                <p className="text-[11px] text-muted">Required average GPA</p>
                <p className="mt-0.5 text-lg font-bold text-fg tabular-nums">
                  {result.requiredAvgGpa !== null ? result.requiredAvgGpa.toFixed(2) : '—'}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/45 p-3">
                <p className="text-[11px] text-muted">Suggested minimum grade</p>
                <p className="mt-0.5 text-lg font-bold text-fg">
                  {result.suggestedMinGrade
                    ? `${result.suggestedMinGrade.label} (${result.suggestedMinGrade.gradePoint.toFixed(2)})`
                    : '—'}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/45 p-3">
                <p className="text-[11px] text-muted">Max achievable CGPA</p>
                <p className="mt-0.5 text-lg font-bold text-fg tabular-nums">
                  {result.maxAchievableCgpa.toFixed(2)}
                </p>
              </div>
            </div>

            {result.courseBreakdown.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Suggested grades across planned courses
                </h3>
                <div className="divide-y divide-line rounded-xl border border-line">
                  {result.courseBreakdown.map((item, idx) => (
                    <div
                      key={`${item.label}-${idx}`}
                      className="flex items-center justify-between px-3.5 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-medium text-fg">{item.label}</p>
                        <p className="text-xs text-muted">{item.creditHours} credits</p>
                      </div>
                      <Badge tone="primary">
                        {item.suggestedGrade} ({item.gradePoint.toFixed(2)})
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
