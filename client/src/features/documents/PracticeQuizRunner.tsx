import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';
import {
  submitPracticeAttempt,
  type DocumentPracticeAttempt,
  type GeneratedQuestionSet,
} from './documentsApi';

interface PracticeQuizRunnerProps {
  questionSet: GeneratedQuestionSet;
  onExit: () => void;
  onAttemptSaved: () => Promise<void>;
}

export function PracticeQuizRunner({
  questionSet,
  onExit,
  onAttemptSaved,
}: PracticeQuizRunnerProps) {
  const toast = useToast();
  const questions = questionSet.questions;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentPracticeAttempt | null>(null);
  const [flippedFlashcard, setFlippedFlashcard] = useState(false);

  useEffect(() => {
    if (!timerEnabled || result) return;
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerEnabled, result]);

  const current = questions[index];
  const answeredCount = questions.filter((q) => Boolean((answers[q.id] ?? '').trim())).length;
  const progressPct = questions.length > 0 ? Math.round(((index + 1) / questions.length) * 100) : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitPracticeAttempt(questionSet.id, answers);
      setResult(res.attempt);
      await onAttemptSaved();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not mark attempt',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setResult(null);
    setIndex(0);
    setElapsedSeconds(0);
    setFlippedFlashcard(false);
  };

  if (result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    const feedbackMap = new Map(result.feedbackJson.map((f) => [f.questionId, f]));

    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">
                Score: {result.score} / {result.total} ({pct}%)
              </h3>
              {timerEnabled ? (
                <p className="text-xs text-muted">Completed in {formatTime(elapsedSeconds)}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleRetake}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Retake
              </Button>
              <Button size="sm" onClick={onExit}>
                Back to set
              </Button>
            </div>
          </div>

          {result.weakTopicsJson.length > 0 ? (
            <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                Weak topics to revise
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.weakTopicsJson.map((topic) => (
                  <Badge key={topic} tone="warning">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-success">
              Great work — no weak topics detected in this attempt!
            </p>
          )}
        </Card>

        <div className="space-y-3">
          {questions.map((q, idx) => {
            const fb = feedbackMap.get(q.id);
            const userAnswer = answers[q.id] ?? '';
            return (
              <Card key={q.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {fb?.correct ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 shrink-0 text-danger" />
                    )}
                    <span className="font-medium text-fg">
                      Question {idx + 1} · {q.topic}
                    </span>
                  </div>
                  <Badge tone="neutral">{q.sourceRef}</Badge>
                </div>

                <div className="mt-2 text-sm">
                  <MarkdownContent content={q.prompt} />
                </div>

                <p className="mt-2 text-xs text-muted">
                  <strong>Your answer:</strong> {userAnswer || '(No answer)'}
                </p>
                <p className="mt-1 text-xs text-fg">
                  <strong>Correct answer:</strong> {q.correctAnswer}
                </p>
                {fb?.feedback ? (
                  <p className="mt-2 rounded-md bg-surface2 p-2.5 text-xs text-fg">{fb.feedback}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">This question set has no questions.</p>
        <Button size="sm" className="mt-3" onClick={onExit}>
          Back
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-xs font-medium text-muted">
            Question {index + 1} of {questions.length} · {answeredCount} answered
          </p>
          <div className="mt-1.5 h-2 w-48 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full bg-primary-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.target.checked)}
            />
            <Clock className="h-3.5 w-3.5" />
            {timerEnabled ? formatTime(elapsedSeconds) : 'Timer'}
          </label>
          <Button size="sm" variant="ghost" onClick={onExit}>
            Exit
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{current.type.replace('_', ' ')}</Badge>
          <Badge tone="neutral">{current.difficulty}</Badge>
          <Badge tone="neutral">{current.topic}</Badge>
          <Badge tone="neutral">{current.sourceRef}</Badge>
        </div>

        <div className="text-base font-medium text-fg">
          <MarkdownContent content={current.prompt} />
        </div>

        {current.type === 'flashcard' ? (
          <div className="space-y-3 rounded-lg border border-line bg-surface2 p-4">
            <Button size="sm" variant="secondary" onClick={() => setFlippedFlashcard((f) => !f)}>
              {flippedFlashcard ? 'Hide answer' : 'Flip card'}
            </Button>
            {flippedFlashcard ? (
              <div className="space-y-2 border-t border-line pt-3 text-sm">
                <p className="font-semibold text-fg">{current.correctAnswer}</p>
                <p className="text-muted">{current.explanation}</p>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={answers[current.id] === 'knew_it' ? 'primary' : 'secondary'}
                    onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: 'knew_it' }))}
                  >
                    I knew this
                  </Button>
                  <Button
                    size="sm"
                    variant={answers[current.id] === 'missed' ? 'danger' : 'secondary'}
                    onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: 'missed' }))}
                  >
                    Need review
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : Array.isArray(current.optionsJson) && current.optionsJson.length > 0 ? (
          <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
            {current.optionsJson.map((opt) => {
              const selected = answers[current.id] === opt;
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
                      : 'border-line hover:bg-surface2'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${current.id}`}
                    checked={selected}
                    onChange={() => setAnswers((prev) => ({ ...prev, [current.id]: opt }))}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <textarea
            rows={current.type === 'essay' ? 6 : 3}
            value={answers[current.id] ?? ''}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
            placeholder="Type your answer here…"
            className="w-full rounded-lg border border-line bg-bg p-3 text-sm text-fg"
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <Button
          size="sm"
          variant="secondary"
          disabled={index === 0}
          onClick={() => {
            setFlippedFlashcard(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
        >
          Previous
        </Button>

        <div className="flex gap-2">
          {index < questions.length - 1 ? (
            <Button
              size="sm"
              onClick={() => {
                setFlippedFlashcard(false);
                setIndex((i) => Math.min(questions.length - 1, i + 1));
              }}
            >
              Next
            </Button>
          ) : (
            <Button size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? 'Marking…' : 'Submit & Mark'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
