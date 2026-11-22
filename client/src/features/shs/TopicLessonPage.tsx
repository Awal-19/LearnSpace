import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  Flag,
  GraduationCap,
  Layers,
  List,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, ErrorState, Modal, Skeleton, Textarea, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

interface LessonSection {
  id: string;
  heading: string;
  body: string;
  keyTerms?: Array<{ term: string; definition: string }>;
  formulaOrRule?: string | null;
  localExample?: string | null;
}

interface TopicLessonResponse {
  topic: {
    id: string;
    title: string;
    strand: string | null;
    subStrand: string | null;
    schoolYear: string | null;
    subjectId: string;
    subjectName: string;
    syllabusVersion: string;
  };
  lesson: {
    id: string;
    status: 'draft' | 'reviewed' | 'approved';
    version: number;
    model: string;
    promptVersion: string;
    generatedAt: string;
    reviewedAt: string | null;
    content: {
      title: string;
      subjectName: string;
      schoolYear: string;
      strand: string;
      subStrand: string;
      estimatedMinutes: number;
      objectives: string[];
      introduction: string;
      sections: LessonSection[];
      workedExamples: Array<{
        id: string;
        title: string;
        problem: string;
        steps: string[];
        finalAnswer: string;
      }>;
      commonMistakes: string[];
      rememberThis: string[];
      checkYourself: Array<{
        id: string;
        question: string;
        options?: string[];
        answer: string;
        explanation: string;
      }>;
      outsideSyllabus?: boolean;
      disclaimer?: string;
    };
  };
  progress: {
    status: 'not_started' | 'in_progress' | 'completed';
    positionPct: number;
    timeSpentSeconds: number;
  };
  prevTopic: { id: string; title: string } | null;
  nextTopic: { id: string; title: string } | null;
}

function getCachedLesson(topicId: string): TopicLessonResponse | null {
  try {
    const raw = localStorage.getItem(`ls_shs_lesson_${topicId}`);
    return raw ? (JSON.parse(raw) as TopicLessonResponse) : null;
  } catch {
    return null;
  }
}

function setCachedLesson(topicId: string, data: TopicLessonResponse) {
  try {
    localStorage.setItem(`ls_shs_lesson_${topicId}`, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function TopicLessonPage() {
  const { subjectId, courseId, topicId } = useParams<{
    subjectId?: string;
    courseId?: string;
    topicId: string;
  }>();
  const activeSubjectId = subjectId ?? courseId ?? '';
  const navigate = useNavigate();
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [fontScale, setFontScale] = useState<'sm' | 'base' | 'lg'>('base');
  const [tocOpen, setTocOpen] = useState(false);
  const [activeTerm, setActiveTerm] = useState<{ term: string; definition: string } | null>(null);
  const [revealedQuiz, setRevealedQuiz] = useState<Record<string, boolean>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const startTimeRef = useRef<number>(Date.now());

  const cached = useMemo(() => (topicId ? getCachedLesson(topicId) : null), [topicId]);

  const query = useQuery({
    queryKey: ['shs', 'lesson', topicId],
    queryFn: async () => {
      const data = await request<TopicLessonResponse>(`/shs/lessons/${topicId}`);
      if (topicId) setCachedLesson(topicId, data);
      return data;
    },
    enabled: Boolean(topicId),
    initialData: cached ?? undefined,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    startTimeRef.current = Date.now();
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max > 0) {
        setScrollPct(Math.min(100, Math.round((window.scrollY / max) * 100)));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (topicId) {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        if (elapsed >= 5) {
          void request(`/shs/lessons/${topicId}/progress`, {
            method: 'PATCH',
            body: { addSeconds: Math.min(3600, elapsed) },
          }).catch(() => undefined);
        }
      }
    };
  }, [topicId]);

  const toggleReadAloud = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.show({ kind: 'info', title: 'Read aloud is not supported in this browser.' });
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = speechRate;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  if (query.isLoading && !query.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-1">
        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400">
            <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
            Preparing your lesson...
          </div>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </Card>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <ErrorState
          title="Could not prepare this lesson"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const { topic, lesson, progress, prevTopic, nextTopic } = query.data;
  const c = lesson.content;
  const isCompleted = progress.status === 'completed';

  const textSizeClass =
    fontScale === 'sm'
      ? 'text-sm leading-relaxed'
      : fontScale === 'lg'
        ? 'text-lg leading-relaxed'
        : 'text-base leading-relaxed';

  const handleMarkCompleted = async () => {
    try {
      await request(`/shs/lessons/${topic.id}/progress`, {
        method: 'PATCH',
        body: { status: 'completed', positionPct: 100 },
      });
      await qc.invalidateQueries({ queryKey: ['shs', 'lesson', topic.id] });
      await qc.invalidateQueries({ queryKey: ['shs', 'subject-topics'] });
      toast.show({ kind: 'success', title: 'Topic marked as completed!' });
    } catch {
      toast.show({ kind: 'error', title: 'Could not update progress' });
    }
  };

  const handleSaveToNotes = async (excerpt?: string) => {
    try {
      const note = await request<{ id: string }>(`/shs/lessons/${topic.id}/save-note`, {
        method: 'POST',
        body: { courseId: activeSubjectId || null, excerpt: excerpt ?? null },
      });
      toast.show({ kind: 'success', title: 'Saved to your Notes' });
      navigate(path(`/notes/${note.id}`));
    } catch {
      toast.show({ kind: 'error', title: 'Could not save to notes' });
    }
  };

  const handleMakeFlashcards = async () => {
    try {
      const res = await request<{ deckId: string; cardsCount: number }>(
        `/shs/lessons/${topic.id}/flashcards`,
        { method: 'POST', body: { courseId: activeSubjectId || null } },
      );
      toast.show({ kind: 'success', title: `Created ${res.cardsCount} flashcards` });
      navigate(path('/study'));
    } catch {
      toast.show({ kind: 'error', title: 'Could not create flashcards' });
    }
  };

  const handleTakeQuiz = async () => {
    try {
      const res = await request<{ quizId: string }>(`/shs/lessons/${topic.id}/quiz`, {
        method: 'POST',
        body: { courseId: activeSubjectId || null },
      });
      toast.show({ kind: 'success', title: 'Quick quiz created' });
      navigate(path(`/study?quizId=${res.quizId}`));
    } catch {
      toast.show({ kind: 'error', title: 'Could not create quiz' });
    }
  };

  const handleSubmitReport = async () => {
    if (reportReason.trim().length < 4) return;
    setSubmittingReport(true);
    try {
      await request(`/shs/lessons/${topic.id}/report`, {
        method: 'POST',
        body: { reason: reportReason.trim() },
      });
      setReportOpen(false);
      setReportReason('');
      toast.show({ kind: 'success', title: 'Thank you! Report sent to teachers/admins.' });
    } catch {
      toast.show({ kind: 'error', title: 'Could not submit report' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const fullLessonText = [
    c.title,
    c.introduction,
    ...c.sections.map((s) => `${s.heading}. ${s.body}`),
  ].join(' ');

  const backToSubjectUrl = activeSubjectId ? path(`/courses/${activeSubjectId}`) : path('/courses');

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Reading progress bar */}
      <div className="sticky top-16 z-10 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full bg-primary-600 transition-[width] duration-150 dark:bg-primary-400"
          style={{ width: `${Math.max(scrollPct, progress.positionPct)}%` }}
        />
      </div>

      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={backToSubjectUrl}
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface2 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {topic.subjectName}
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setFontScale((s) => (s === 'lg' ? 'sm' : s === 'sm' ? 'base' : 'lg'))}
            aria-label="Change text size"
          >
            A-/A+
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => toggleReadAloud(fullLessonText)}
          >
            {speaking ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {speaking ? 'Pause' : 'Read aloud'}
          </Button>
          <select
            aria-label="Read aloud speed"
            value={speechRate}
            onChange={(e) => setSpeechRate(Number(e.target.value))}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg"
          >
            <option value={0.85}>0.85x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
          </select>
        </div>
      </div>

      {/* 1. Lesson Header */}
      <Card className="space-y-3 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="primary">{topic.subjectName}</Badge>
          {topic.schoolYear ? <Badge tone="neutral">{topic.schoolYear}</Badge> : null}
          <Badge tone="neutral">{c.estimatedMinutes} min read</Badge>
          {lesson.status === 'approved' ? (
            <Badge tone="success">Approved</Badge>
          ) : lesson.status === 'reviewed' ? (
            <Badge tone="primary">Reviewed</Badge>
          ) : (
            <Badge tone="neutral">Draft</Badge>
          )}
          {isCompleted ? (
            <Badge tone="success" className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          ) : null}
        </div>

        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {c.title}
        </h1>
        <p className="text-xs text-muted">
          Syllabus: {topic.strand ?? c.strand}
          {topic.subStrand || c.subStrand ? ` · ${topic.subStrand || c.subStrand}` : ''} (
          {topic.syllabusVersion})
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50/50 px-3.5 py-2.5 text-xs text-muted dark:border-amber-500/25 dark:bg-amber-500/10">
          <span>
            {c.disclaimer ?? 'AI-prepared study notes. Check with your teacher and textbook.'}
          </span>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1 font-medium text-danger hover:underline"
          >
            <Flag className="h-3.5 w-3.5" /> Report a mistake
          </button>
        </div>
      </Card>

      {/* Collapsible Table of Contents */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setTocOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-semibold text-fg"
        >
          <span className="inline-flex items-center gap-2">
            <List className="h-4 w-4 text-primary-600" />
            Table of Contents
          </span>
          {tocOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {tocOpen ? (
          <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-primary-600 dark:text-primary-400">
            {c.sections.map((s) => (
              <li key={s.id}>
                <a href={`#sec-${s.id}`} className="hover:underline">
                  {s.heading}
                </a>
              </li>
            ))}
            <li>
              <a href="#check-yourself" className="hover:underline">
                Check yourself (5 questions)
              </a>
            </li>
          </ul>
        ) : null}
      </Card>

      {/* 2. What you will learn & 3. Introduction */}
      <Card className={`space-y-4 p-5 sm:p-7 ${textSizeClass}`}>
        <div className="rounded-xl border border-primary-200/70 bg-primary-50/50 p-4 dark:border-primary-500/20 dark:bg-primary-500/10">
          <h2 className="font-display text-base font-semibold text-fg">What you will learn</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg/90">
            {c.objectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>

        <p className="text-fg/90 whitespace-pre-line">{c.introduction}</p>
      </Card>

      {/* 4. Lesson Sections */}
      {c.sections.map((sec) => (
        <Card key={sec.id} id={`sec-${sec.id}`} className={`space-y-4 p-5 sm:p-7 ${textSizeClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-fg">{sec.heading}</h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate(
                  path(
                    `/chat?prefill=${encodeURIComponent(
                      `Explain "${sec.heading}" from ${c.title} (${topic.subjectName}) in a simpler way with another Ghanaian example.`,
                    )}`,
                  ),
                )
              }
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Explain this differently
            </Button>
          </div>

          <div className="overflow-x-auto max-w-full whitespace-pre-line text-fg/90">
            {sec.body}
          </div>

          {sec.formulaOrRule ? (
            <div className="overflow-x-auto max-w-full rounded-xl border border-primary-300/70 bg-primary-50/60 p-3.5 text-sm font-medium text-fg dark:border-primary-500/30 dark:bg-primary-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                Rule / Formula
              </p>
              <p className="mt-1 whitespace-pre-wrap">{sec.formulaOrRule}</p>
            </div>
          ) : null}

          {sec.localExample ? (
            <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/50 p-3.5 text-sm text-fg dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Ghanaian Example
              </p>
              <p className="mt-1 whitespace-pre-line">{sec.localExample}</p>
            </div>
          ) : null}

          {sec.keyTerms && sec.keyTerms.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted">Key terms (tap for definition):</p>
              <div className="flex flex-wrap gap-1.5">
                {sec.keyTerms.map((kt) => (
                  <button
                    key={kt.term}
                    type="button"
                    onClick={() => setActiveTerm(kt)}
                    className="rounded-full border border-primary-300/70 bg-primary-50/60 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300"
                  >
                    {kt.term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ))}

      {/* 5. Worked Examples */}
      {c.workedExamples.length > 0 ? (
        <Card className="space-y-4 p-5 sm:p-7">
          <h2 className="font-display text-xl font-bold text-fg">Worked Examples</h2>
          {c.workedExamples.map((ex) => (
            <div
              key={ex.id}
              className="space-y-2 rounded-xl border border-line bg-surface2/40 p-4 overflow-x-auto max-w-full"
            >
              <p className="font-semibold text-fg">{ex.title}</p>
              <p className="text-sm text-fg/90">{ex.problem}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-fg/85">
                {ex.steps.map((st, idx) => (
                  <li key={idx}>{st}</li>
                ))}
              </ol>
              <p className="pt-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                Answer: {ex.finalAnswer}
              </p>
            </div>
          ))}
        </Card>
      ) : null}

      {/* 6. Common Mistakes & Remember This */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-2 border-rose-200/80 bg-rose-50/40 p-5 dark:border-rose-500/20 dark:bg-rose-500/5">
          <h2 className="font-display text-base font-semibold text-fg">Common Mistakes</h2>
          <ul className="list-disc space-y-1 pl-4 text-xs text-fg/90">
            {c.commonMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2 border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <h2 className="font-display text-base font-semibold text-fg">Remember This</h2>
          <ul className="list-disc space-y-1 pl-4 text-xs text-fg/90">
            {c.rememberThis.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 7. Check Yourself */}
      <Card id="check-yourself" className="space-y-4 p-5 sm:p-7">
        <h2 className="font-display text-xl font-bold text-fg">Check Yourself</h2>
        <div className="space-y-3">
          {c.checkYourself.map((q, idx) => {
            const shown = Boolean(revealedQuiz[q.id]);
            return (
              <div
                key={q.id}
                className="space-y-2 rounded-xl border border-line bg-surface2/40 p-4"
              >
                <p className="text-sm font-medium text-fg">
                  {idx + 1}. {q.question}
                </p>
                {q.options && q.options.length > 0 ? (
                  <ul className="space-y-1 pl-4 text-xs text-muted">
                    {q.options.map((opt, oi) => (
                      <li key={oi}>
                        {String.fromCharCode(65 + oi)}. {opt}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setRevealedQuiz((p) => ({ ...p, [q.id]: !shown }))}
                >
                  {shown ? 'Hide answer' : 'Tap to reveal answer'}
                </Button>
                {shown ? (
                  <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/50 p-3 text-xs dark:border-emerald-500/25 dark:bg-emerald-500/10">
                    <p className="font-semibold text-fg">Answer: {q.answer}</p>
                    <p className="mt-1 text-muted">{q.explanation}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 8. Action Buttons & Topic Navigation */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              navigate(
                path(
                  `/chat?prefill=${encodeURIComponent(
                    `I just read the lesson on "${c.title}" in ${topic.subjectName}. Ask me a practice question to test my understanding!`,
                  )}`,
                ),
              )
            }
          >
            <MessageSquare className="h-4 w-4" /> Ask AWAL about this topic
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleMakeFlashcards()}
          >
            <Layers className="h-4 w-4" /> Make flashcards from this lesson
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleTakeQuiz()}>
            <GraduationCap className="h-4 w-4" /> Take a quiz on this topic
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleSaveToNotes()}
          >
            <FilePlus2 className="h-4 w-4" /> Save to my notes
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isCompleted ? 'ghost' : 'primary'}
            onClick={() => void handleMarkCompleted()}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleted ? 'Completed' : 'Mark as completed'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs">
          {prevTopic ? (
            <Link
              to={path(
                activeSubjectId
                  ? `/subjects/${activeSubjectId}/topics/${prevTopic.id}`
                  : `/subjects/${topic.subjectId}/topics/${prevTopic.id}`,
              )}
              className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous: {prevTopic.title}
            </Link>
          ) : (
            <span />
          )}
          {nextTopic ? (
            <Link
              to={path(
                activeSubjectId
                  ? `/subjects/${activeSubjectId}/topics/${nextTopic.id}`
                  : `/subjects/${topic.subjectId}/topics/${nextTopic.id}`,
              )}
              className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline"
            >
              Next: {nextTopic.title} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </Card>

      {/* Key Term Modal */}
      <Modal
        open={Boolean(activeTerm)}
        onClose={() => setActiveTerm(null)}
        title={activeTerm?.term ?? 'Key Term'}
      >
        <div className="p-5 text-sm text-fg">
          <p>{activeTerm?.definition}</p>
        </div>
      </Modal>

      {/* Report a Mistake Modal */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a mistake in this lesson"
      >
        <div className="space-y-4 p-5">
          <Textarea
            label="What needs to be fixed?"
            rows={4}
            placeholder="Describe the typo, unclear step, or wrong answer..."
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={submittingReport}
              onClick={() => void handleSubmitReport()}
            >
              Submit Report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
