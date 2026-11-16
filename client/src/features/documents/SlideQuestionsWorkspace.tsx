import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Download,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';
import {
  exportQuestionSet,
  generateQuestionsFromDoc,
  refineGeneratedQuestion,
  saveSetToLibrary,
  type DocumentDetailResponse,
  type GeneratedQuestion,
  type GeneratedQuestionSet,
  type GeneratedQuestionType,
} from './documentsApi';
import { PracticeQuizRunner } from './PracticeQuizRunner';

const TYPE_OPTIONS: Array<{ value: GeneratedQuestionType; label: string }> = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'essay', label: 'Essay' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'calculation', label: 'Calculation / Problem' },
  { value: 'flashcard', label: 'Flashcards' },
];

interface SlideQuestionsWorkspaceProps {
  detail: DocumentDetailResponse;
  onRefresh: () => Promise<void>;
}

export function SlideQuestionsWorkspace({ detail, onRefresh }: SlideQuestionsWorkspaceProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const appPath = useAppPath();

  const [selectedTypes, setSelectedTypes] = useState<GeneratedQuestionType[]>([
    'mcq',
    'short_answer',
  ]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [scope, setScope] = useState<'whole' | 'pages' | 'topic'>('whole');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState<'exam' | 'quick_revision'>('exam');
  const [generating, setGenerating] = useState(false);

  const [sets, setSets] = useState<GeneratedQuestionSet[]>(detail.questionSets);
  const [activeSetId, setActiveSetId] = useState<string>(detail.questionSets[0]?.id ?? '');
  const [practicing, setPracticing] = useState(false);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [savingLib, setSavingLib] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSets(detail.questionSets);
    if (detail.questionSets.length > 0 && !detail.questionSets.some((s) => s.id === activeSetId)) {
      setActiveSetId(detail.questionSets[0]!.id);
    }
  }, [detail.questionSets, activeSetId]);

  const isGenerateJobRunning =
    detail.latestJob?.kind === 'generate_set' &&
    (detail.latestJob.status === 'queued' || detail.latestJob.status === 'running');

  const activeSet = sets.find((s) => s.id === activeSetId) ?? sets[0] ?? null;

  const toggleType = (value: GeneratedQuestionType) => {
    setSelectedTypes((prev) =>
      prev.includes(value)
        ? prev.length > 1
          ? prev.filter((t) => t !== value)
          : prev
        : [...prev, value],
    );
  };

  const togglePage = (pageNum: number) => {
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum],
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateQuestionsFromDoc(detail.document.id, {
        types: selectedTypes,
        count,
        difficulty,
        scope,
        selectedPages: scope === 'pages' ? selectedPages : undefined,
        topic: scope === 'topic' ? topic.trim() || undefined : undefined,
        style,
      });
      toast.show({ kind: 'info', title: 'Generating questions from your slides…' });
      await onRefresh();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Generation failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async (
    q: GeneratedQuestion,
    action: 'regenerate' | 'harder' | 'easier' | 'more_on_topic',
  ) => {
    if (!activeSet) return;
    setRefiningId(q.id);
    try {
      const res = await refineGeneratedQuestion(activeSet.id, q.id, action);
      setSets((prev) =>
        prev.map((s) => {
          if (s.id !== activeSet.id) return s;
          if (action === 'more_on_topic' && res.addedQuestions?.length) {
            return { ...s, questions: [...s.questions, ...res.addedQuestions] };
          }
          return {
            ...s,
            questions: s.questions.map((item) => (item.id === res.question.id ? res.question : item)),
          };
        }),
      );
      toast.show({
        kind: 'success',
        title: action === 'more_on_topic' ? 'Added 2 more questions' : 'Question updated',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update question',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setRefiningId(null);
    }
  };

  const handleSaveToLibrary = async (target: 'quiz' | 'deck' | 'both') => {
    if (!activeSet) return;
    setSavingLib(true);
    try {
      await saveSetToLibrary(activeSet.id, target);
      toast.show({
        kind: 'success',
        title:
          target === 'deck'
            ? 'Saved flashcards to Study library'
            : target === 'quiz'
              ? 'Saved quiz to Study library'
              : 'Saved Quiz & Flashcards to Study library',
      });
      await onRefresh();
      if (target === 'deck') {
        navigate(appPath('/study'));
      }
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSavingLib(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!activeSet) return;
    setExporting(format);
    try {
      await exportQuestionSet(activeSet.id, format, activeSet.title.replace(/\s+/g, '_'));
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Export failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setExporting(null);
    }
  };

  if (practicing && activeSet) {
    return (
      <PracticeQuizRunner
        questionSet={activeSet}
        onExit={() => setPracticing(false)}
        onAttemptSaved={onRefresh}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">
          Mode 2: Generate Questions from Slides
        </h2>
        <p className="text-sm text-muted">
          Questions are generated strictly from this document with slide/page citations.
        </p>

        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Question types
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const active = selectedTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleType(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-line bg-bg text-fg hover:bg-surface2'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-fg">Count</span>
              <input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-fg">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as 'easy' | 'medium' | 'hard' | 'mixed')
                }
                className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-fg">Style</span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as 'exam' | 'quick_revision')}
                className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
              >
                <option value="exam">Exam-style</option>
                <option value="quick_revision">Quick revision</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-fg">Scope</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'whole' | 'pages' | 'topic')}
                className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
              >
                <option value="whole">Whole document</option>
                <option value="pages">Selected slides / pages</option>
                <option value="topic">Specific topic</option>
              </select>
            </label>
          </div>

          {scope === 'pages' ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">Select slides/pages:</span>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
                {detail.document.pagesJson.map((p) => {
                  const picked = selectedPages.includes(p.index);
                  return (
                    <button
                      key={p.index}
                      type="button"
                      onClick={() => togglePage(p.index)}
                      className={`rounded px-2 py-1 text-xs ${
                        picked
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface2 text-fg hover:bg-surface'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {scope === 'topic' ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-fg">Topic</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Dynamic Programming or Acid-Base Equilibria"
                className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
              />
            </label>
          ) : null}

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating || isGenerateJobRunning}
            >
              {generating || isGenerateJobRunning ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Generating ({detail.latestJob?.progress ?? 0}%)…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Generate {count} questions
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {sets.length > 0 && activeSet ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeSet.id}
                  onChange={(e) => setActiveSetId(e.target.value)}
                  className="rounded-md border border-line bg-bg px-3 py-1.5 text-sm font-medium"
                >
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.questions.length} Qs)
                    </option>
                  ))}
                </select>
                {activeSet.attempts && activeSet.attempts.length > 0 ? (
                  <Badge tone="success">
                    Best: {Math.max(...activeSet.attempts.map((a) => a.score))}/
                    {activeSet.questions.length}
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPracticing(true)}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Practice mode
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={savingLib}
                  onClick={() => void handleSaveToLibrary('deck')}
                >
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                  Study as flashcards
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={savingLib}
                  onClick={() => void handleSaveToLibrary('both')}
                >
                  <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
                  Save to Library
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={exporting !== null}
                  onClick={() => void handleExport('pdf')}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={exporting !== null}
                  onClick={() => void handleExport('docx')}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Word
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {activeSet.questions.map((q, idx) => {
              const revealed = Boolean(revealedAnswers[q.id]);
              const isRefining = refiningId === q.id;
              return (
                <Card key={q.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-fg">Q{idx + 1}</span>
                      <Badge tone="neutral">{q.type.replace('_', ' ')}</Badge>
                      <Badge tone="neutral">{q.difficulty}</Badge>
                      <Badge tone="neutral">{q.topic}</Badge>
                    </div>
                    <Badge tone="success">{q.sourceRef}</Badge>
                  </div>

                  <div className="mt-2 text-sm text-fg">
                    <MarkdownContent content={q.prompt} />
                  </div>

                  {Array.isArray(q.optionsJson) && q.optionsJson.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                      {q.optionsJson.map((opt) => (
                        <li key={opt}>{opt}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setRevealedAnswers((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                    >
                      {revealed ? 'Hide answer' : 'Show answer'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRefining}
                      onClick={() => void handleRefine(q, 'regenerate')}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Regenerate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRefining}
                      onClick={() => void handleRefine(q, 'harder')}
                    >
                      <ArrowUp className="mr-1 h-3.5 w-3.5" />
                      Make harder
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRefining}
                      onClick={() => void handleRefine(q, 'easier')}
                    >
                      <ArrowDown className="mr-1 h-3.5 w-3.5" />
                      Make easier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRefining}
                      onClick={() => void handleRefine(q, 'more_on_topic')}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      More on this topic
                    </Button>
                  </div>

                  {revealed ? (
                    <div className="mt-3 rounded-lg border border-line bg-surface2 p-3 text-sm">
                      <p className="font-semibold text-fg">Answer: {q.correctAnswer}</p>
                      <p className="mt-1 text-muted">{q.explanation}</p>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

