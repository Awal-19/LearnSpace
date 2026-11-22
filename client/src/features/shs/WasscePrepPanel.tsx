import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Clock, ExternalLink, Sparkles, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, Input, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { fetchShsCatalogue, type CourseSummary } from '../courses/coursesApi';

interface MockQuestionPublic {
  id: string;
  type: 'objective' | 'theory';
  topic: string;
  prompt: string;
  options?: string[];
  marks?: number;
}

interface GradedQuestion extends MockQuestionPublic {
  correctIndex?: number;
  explanation?: string;
  markingScheme?: string[];
  modelGuide?: string;
}

interface MockStartResponse {
  attemptId: string;
  courseName: string;
  format: 'objective' | 'theory' | 'mixed';
  durationMinutes: number;
  questions: MockQuestionPublic[];
}

interface MockSubmitResponse {
  attemptId: string;
  score: number | null;
  total: number;
  weakTopics: string[];
  questions: GradedQuestion[];
  answers: Record<string, number | string>;
}

interface AttemptsResponse {
  attempts: Array<{
    id: string;
    courseId: string;
    courseName: string;
    courseCode: string | null;
    format: string;
    score: number | null;
    total: number;
    weakTopics: string[];
    durationSeconds: number;
    completedAt: string | null;
    createdAt: string;
  }>;
  weakTopics: Array<{ courseId: string; courseName: string; topic: string; count: number }>;
  officialSources: Array<{ title: string; url: string; source: string }>;
}

export function WasscePrepPanel({ courses }: { courses: CourseSummary[] }) {
  const path = useAppPath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [format, setFormat] = useState<'objective' | 'theory' | 'mixed'>('objective');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  const [activeMock, setActiveMock] = useState<MockStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [elapsedSec, setElapsedSec] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [graded, setGraded] = useState<MockSubmitResponse | null>(null);

  useEffect(() => {
    if (!courseId && courses[0]?.id) setCourseId(courses[0].id);
  }, [courseId, courses]);

  useEffect(() => {
    if (!activeMock || graded) return;
    const timer = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [activeMock, graded]);

  const attemptsQuery = useQuery({
    queryKey: ['shs', 'wassce-attempts'],
    queryFn: () => request<AttemptsResponse>('/shs/wassce/attempts'),
  });

  const catalogueQuery = useQuery({
    queryKey: ['shs', 'catalogue'],
    queryFn: fetchShsCatalogue,
    staleTime: 60_000,
  });

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  const availableTopics = useMemo(() => {
    const subjects = catalogueQuery.data?.subjects ?? [];
    const matched = subjects.find(
      (s) =>
        s.id === selectedCourse?.catalogueSubjectId ||
        s.name.toLowerCase() === selectedCourse?.name.toLowerCase(),
    );
    return matched?.topics ?? [];
  }, [catalogueQuery.data, selectedCourse]);

  const handleStartMock = async () => {
    if (!courseId) {
      toast.show({ kind: 'error', title: 'Add or select an SHS subject first.' });
      return;
    }
    const topics = [
      ...selectedTopics,
      ...customTopic
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ];
    setGenerating(true);
    setGraded(null);
    setAnswers({});
    setElapsedSec(0);
    try {
      const res = await request<MockStartResponse>('/shs/wassce/mock', {
        method: 'POST',
        body: { courseId, format, topics, questionCount },
      });
      setActiveMock(res);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not generate WASSCE mock',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitMock = async () => {
    if (!activeMock) return;
    setSubmitting(true);
    try {
      const res = await request<MockSubmitResponse>(
        `/shs/wassce/mock/${activeMock.attemptId}/submit`,
        {
          method: 'POST',
          body: { answers, durationSeconds: elapsedSec },
        },
      );
      setGraded(res);
      await qc.invalidateQueries({ queryKey: ['shs', 'wassce-attempts'] });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not submit mock exam',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviseTopic = (subjectName: string, topic: string) => {
    const prompt = `Teach me "${topic}" in ${subjectName} for WASSCE step by step, then give me one quick practice question.`;
    navigate(path(`/chat?prefill=${encodeURIComponent(prompt)}`));
  };

  const remainingSec = activeMock ? Math.max(0, activeMock.durationMinutes * 60 - elapsedSec) : 0;
  const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secs = String(remainingSec % 60).padStart(2, '0');

  return (
    <div className="space-y-6">
      {!activeMock ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-fg">
                WASSCE Practice Mock Generator
              </h2>
              <p className="text-xs text-muted">
                Generates original practice questions from your syllabus topics and notes (never
                copied past papers).
              </p>
            </div>
            <Badge tone="primary">Original WASSCE Style</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">Subject</span>
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setSelectedTopics([]);
                }}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                {courses.length === 0 ? (
                  <option value="">No subjects yet</option>
                ) : (
                  courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">Paper format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'objective' | 'theory' | 'mixed')}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value="objective">Paper 1: Objective (A–D)</option>
                <option value="theory">Paper 2: Theory / Essay</option>
                <option value="mixed">Mixed (Objective + Theory)</option>
              </select>
            </label>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">Questions</span>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value={5}>5 questions</option>
                <option value={10}>10 questions</option>
                <option value={15}>15 questions</option>
              </select>
            </label>
          </div>

          {availableTopics.length > 0 ? (
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-fg">Syllabus topics</span>
              <div className="flex flex-wrap gap-1.5">
                {availableTopics.map((t) => {
                  const active = selectedTopics.includes(t.title);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setSelectedTopics((prev) =>
                          active ? prev.filter((x) => x !== t.title) : [...prev, t.title],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-600/10 text-primary-700 dark:text-primary-300'
                          : 'border-line bg-surface2/50 text-muted hover:text-fg'
                      }`}
                    >
                      {t.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Input
            label="Extra topic(s) (optional, comma-separated)"
            placeholder="e.g. Quadratic equations, Organic chemistry"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
          />

          <Button type="button" loading={generating} onClick={() => void handleStartMock()}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Start Timed Mock Exam
          </Button>
        </Card>
      ) : (
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-fg">
                {activeMock.courseName} — WASSCE Mock ({activeMock.format})
              </h2>
              <p className="text-xs text-muted">
                {graded
                  ? graded.score !== null
                    ? `Score: ${graded.score} / ${graded.total}`
                    : 'Theory marking guide ready below'
                  : 'Answer every question, then submit to see instant marking and guidance.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!graded ? (
                <Badge tone="warning" className="inline-flex items-center gap-1 font-mono">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {mins}:{secs}
                </Badge>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActiveMock(null);
                  setGraded(null);
                }}
              >
                New Mock
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {(graded ? graded.questions : activeMock.questions).map((q, idx) => (
              <div
                key={q.id}
                className="space-y-2 rounded-xl border border-line bg-surface2/40 p-4"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Badge tone="neutral">{q.topic}</Badge>
                  {q.marks ? <span className="text-muted">{q.marks} marks</span> : null}
                </div>
                <p className="text-sm font-medium text-fg">
                  {idx + 1}. {q.prompt}
                </p>

                {q.type === 'objective' && q.options ? (
                  <div className="space-y-1.5 pt-1">
                    {q.options.map((opt, oIdx) => {
                      const chosen = answers[q.id] === oIdx;
                      const isCorrect = graded && (q as GradedQuestion).correctIndex === oIdx;
                      const isWrongChosen = graded && chosen && !isCorrect;
                      return (
                        <label
                          key={oIdx}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-500/10 text-fg'
                              : isWrongChosen
                                ? 'border-danger bg-danger/10 text-fg'
                                : chosen
                                  ? 'border-primary-600 bg-primary-600/10 text-fg'
                                  : 'border-line bg-surface text-muted hover:text-fg'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            disabled={Boolean(graded)}
                            checked={chosen}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                          />
                          <span>
                            {String.fromCharCode(65 + oIdx)}. {opt}
                          </span>
                        </label>
                      );
                    })}
                    {graded && (q as GradedQuestion).explanation ? (
                      <p className="pt-1 text-xs text-muted">
                        <strong>Explanation:</strong> {(q as GradedQuestion).explanation}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={4}
                      disabled={Boolean(graded)}
                      value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Write your step-by-step theory or essay answer here..."
                      className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-fg"
                    />
                    {graded ? (
                      <div className="rounded-lg border border-primary-200/70 bg-primary-50/50 p-3 text-xs dark:border-primary-500/20 dark:bg-primary-500/10 space-y-1">
                        <p className="font-semibold text-fg">WASSCE Marking Guidance:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted">
                          {((q as GradedQuestion).markingScheme ?? []).map((pt, i) => (
                            <li key={i}>{pt}</li>
                          ))}
                        </ul>
                        {(q as GradedQuestion).modelGuide ? (
                          <p className="pt-1 text-fg">{(q as GradedQuestion).modelGuide}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!graded ? (
            <Button type="button" loading={submitting} onClick={() => void handleSubmitMock()}>
              Submit &amp; Grade Mock
            </Button>
          ) : graded.weakTopics.length > 0 ? (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10 space-y-2">
              <p className="text-xs font-semibold text-fg">Topics to revise:</p>
              <div className="flex flex-wrap gap-2">
                {graded.weakTopics.map((topic) => {
                  const matchedTopic = availableTopics.find(
                    (t) => t.title.toLowerCase() === topic.toLowerCase(),
                  );
                  return (
                    <div key={topic} className="flex flex-wrap items-center gap-1.5">
                      {matchedTopic ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            navigate(path(`/subjects/${courseId}/topics/${matchedTopic.id}`))
                          }
                        >
                          Read the lesson on {topic}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleReviseTopic(activeMock.courseName, topic)}
                      >
                        Revise {topic}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-fg">
              Weak Topics &amp; Quick Revision
            </h3>
          </div>
          {attemptsQuery.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (attemptsQuery.data?.weakTopics ?? []).length === 0 ? (
            <p className="text-xs text-muted">
              Complete a WASSCE mock exam to track weak topics by subject.
            </p>
          ) : (
            <div className="space-y-2">
              {attemptsQuery.data!.weakTopics.map((w) => (
                <div
                  key={`${w.courseId}-${w.topic}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2/40 px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-medium text-fg">{w.topic}</p>
                    <p className="text-muted">
                      {w.courseName} · missed {w.count}x
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleReviseTopic(w.courseName, w.topic)}
                  >
                    Revise this topic
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <BookOpenCheck
              className="h-4 w-4 text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
            <h3 className="font-display text-base font-semibold text-fg">
              Official Syllabi &amp; Past-Question Portals
            </h3>
          </div>
          <p className="text-xs text-muted">
            For official WAEC Ghana Chief Examiner reports and NaCCA syllabi, use these legitimate
            sources:
          </p>
          <div className="space-y-2">
            {(attemptsQuery.data?.officialSources ?? []).map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-primary-300"
              >
                <span>{src.title}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
