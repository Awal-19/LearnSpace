import {
  AlertTriangle,
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  GitMerge,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  Sparkles,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { useAppPath } from '../../app/basePath';
import { MarkdownContent } from '../chat/MarkdownContent';
import {
  detectQuestions,
  exportDocumentAnswers,
  patchQuestions,
  saveDocumentAnswersToNotes,
  streamQuestionAnswer,
  type AnswerMode,
  type DocumentDetailResponse,
  type ExtractedQuestion,
} from './documentsApi';

interface PastQuestionsWorkspaceProps {
  detail: DocumentDetailResponse;
  onRefresh: () => Promise<void>;
}

export function PastQuestionsWorkspace({ detail, onRefresh }: PastQuestionsWorkspaceProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const appPath = useAppPath();

  const [questions, setQuestions] = useState<ExtractedQuestion[]>(detail.extractedQuestions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('full_worked');
  const [useCourseNotes, setUseCourseNotes] = useState(Boolean(detail.document.courseId));
  const [detecting, setDetecting] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuestions(detail.extractedQuestions);
  }, [detail.extractedQuestions]);

  const isDetectJobRunning =
    detail.latestJob?.kind === 'detect_questions' &&
    (detail.latestJob.status === 'queued' || detail.latestJob.status === 'running');

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await detectQuestions(detail.document.id);
      toast.show({ kind: 'info', title: 'Detecting questions…' });
      await onRefresh();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Detection failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setDetecting(false);
    }
  };

  const persistQuestions = async (next: ExtractedQuestion[]) => {
    setSavingEdits(true);
    try {
      const res = await patchQuestions(
        detail.document.id,
        next.map((q) => ({
          id: q.id.startsWith('temp-') ? undefined : q.id,
          section: q.section,
          questionNumber: q.questionNumber,
          prompt: q.prompt,
          marks: q.marks,
          instructions: q.instructions,
          unclear: q.unclear,
          unclearReason: q.unclearReason,
          selected: q.selected,
        })),
      );
      setQuestions(res.questions);
      toast.show({ kind: 'success', title: 'Questions updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save question edits',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSavingEdits(false);
    }
  };

  const toggleSelect = async (id: string) => {
    const next = questions.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q));
    setQuestions(next);
    await persistQuestions(next);
  };

  const mergeWithNext = async (idx: number) => {
    if (idx >= questions.length - 1) return;
    const current = questions[idx]!;
    const nextQ = questions[idx + 1]!;
    const merged: ExtractedQuestion = {
      ...current,
      prompt: `${current.prompt}\n\n${nextQ.questionNumber}: ${nextQ.prompt}`,
      marks:
        current.marks !== null || nextQ.marks !== null
          ? (current.marks ?? 0) + (nextQ.marks ?? 0)
          : null,
      unclear: current.unclear || nextQ.unclear,
    };
    const next = [...questions.slice(0, idx), merged, ...questions.slice(idx + 2)];
    await persistQuestions(next);
  };

  const splitQuestion = async (idx: number) => {
    const target = questions[idx]!;
    const lines = target.prompt.split(/\n{2,}/);
    let firstPart = '';
    let secondPart = '';
    if (lines.length >= 2) {
      const mid = Math.ceil(lines.length / 2);
      firstPart = lines.slice(0, mid).join('\n\n').trim();
      secondPart = lines.slice(mid).join('\n\n').trim();
    } else {
      const mid = Math.ceil(target.prompt.length / 2);
      firstPart = target.prompt.slice(0, mid).trim();
      secondPart = target.prompt.slice(mid).trim();
    }
    if (!firstPart || !secondPart) {
      toast.show({ kind: 'info', title: 'Question is too short to split' });
      return;
    }
    const partA: ExtractedQuestion = { ...target, prompt: firstPart };
    const partB: ExtractedQuestion = {
      ...target,
      id: `temp-${Date.now()}`,
      questionNumber: `${target.questionNumber}b`,
      prompt: secondPart,
      answerMarkdown: null,
      thinkingMarkdown: null,
      status: 'pending',
    };
    const next = [...questions.slice(0, idx), partA, partB, ...questions.slice(idx + 1)];
    await persistQuestions(next);
  };

  const answerSingleQuestion = async (
    q: ExtractedQuestion,
    refinement?: 'regenerate' | 'simpler' | 'another_method',
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setAnsweringId(q.id);
    setStreamingText((prev) => ({ ...prev, [q.id]: '' }));

    try {
      await streamQuestionAnswer({
        documentId: detail.document.id,
        questionId: q.id,
        mode: answerMode,
        useCourseNotes,
        refinement,
        signal: controller.signal,
        onDelta: (delta) => {
          setStreamingText((prev) => ({
            ...prev,
            [q.id]: (prev[q.id] ?? '') + delta,
          }));
        },
        onDone: (updated) => {
          setQuestions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          setStreamingText((prev) => {
            const copy = { ...prev };
            delete copy[q.id];
            return copy;
          });
        },
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.show({
          kind: 'error',
          title: `Failed answering Q${q.questionNumber}`,
          description: err instanceof ApiError ? err.message : 'AI provider error',
        });
      }
    } finally {
      setAnsweringId(null);
      abortRef.current = null;
    }
  };

  const handleAnswerSelected = async () => {
    const selected = questions.filter((q) => q.selected);
    if (selected.length === 0) {
      toast.show({ kind: 'info', title: 'Select at least one question first' });
      return;
    }
    setBatchRunning(true);
    try {
      for (const q of selected) {
        if (abortRef.current?.signal.aborted) break;
        await answerSingleQuestion(q);
      }
    } finally {
      setBatchRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setBatchRunning(false);
    setAnsweringId(null);
  };

  const handleCopy = async (q: ExtractedQuestion) => {
    const text = `Question ${q.questionNumber}\n${q.prompt}\n\n${q.answerMarkdown ?? ''}`.trim();
    await navigator.clipboard.writeText(text);
    setCopiedId(q.id);
    setTimeout(() => setCopiedId((prev) => (prev === q.id ? null : prev)), 1500);
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    setExporting(format);
    try {
      await exportDocumentAnswers(
        detail.document.id,
        format,
        detail.document.title.replace(/\s+/g, '_'),
      );
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Export failed',
        description: err instanceof ApiError ? err.message : 'Answer at least one question first.',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleSaveToNotes = async () => {
    setSavingNotes(true);
    try {
      const saved = await saveDocumentAnswersToNotes(detail.document.id);
      toast.show({
        kind: 'success',
        title: 'Saved to Notes',
        description: saved.title,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save to Notes',
        description: err instanceof ApiError ? err.message : 'Answer at least one question first.',
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const answeredCount = questions.filter((q) => q.answerMarkdown).length;
  const selectedCount = questions.filter((q) => q.selected).length;

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Mode 1: Answer Past Questions</h2>
            <p className="text-sm text-muted">
              Review detected questions, edit/merge/split if needed, and stream detailed solutions.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDetect()}
            disabled={detecting || isDetectJobRunning || detail.document.status !== 'ready'}
          >
            {detecting || isDetectJobRunning ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Detecting ({detail.latestJob?.progress ?? 0}%)…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {questions.length > 0 ? 'Re-detect questions' : 'Detect questions'}
              </>
            )}
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Answer mode:</span>
              <select
                value={answerMode}
                onChange={(e) => setAnswerMode(e.target.value as AnswerMode)}
                className="rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-fg"
              >
                <option value="full_worked">Full worked solutions</option>
                <option value="answers_only">Answers only</option>
                <option value="marking_scheme">Exam-style marking scheme</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCourseNotes}
                onChange={(e) => setUseCourseNotes(e.target.checked)}
                className="rounded border-line"
              />
              <span>Use my course notes</span>
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {batchRunning || answeringId ? (
                <Button variant="danger" size="sm" onClick={handleStop}>
                  <Square className="mr-1.5 h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleAnswerSelected()}
                  disabled={selectedCount === 0}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Answer selected ({selectedCount})
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExport('pdf')}
                disabled={answeredCount === 0 || exporting !== null}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExport('docx')}
                disabled={answeredCount === 0 || exporting !== null}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exporting === 'docx' ? 'Exporting…' : 'Word'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSaveToNotes()}
                disabled={answeredCount === 0 || savingNotes}
              >
                <BookMarked className="mr-1.5 h-3.5 w-3.5" />
                {savingNotes ? 'Saving…' : 'Save to Notes'}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {questions.length === 0 && !isDetectJobRunning ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Click <strong>Detect questions</strong> above to extract numbered questions, marks, and
            instructions from this paper.
          </p>
        </Card>
      ) : null}

      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isEditing = editingId === q.id;
          const isStreamingThis = answeringId === q.id;
          const liveAnswer = isStreamingThis ? (streamingText[q.id] ?? '') : q.answerMarkdown;
          const thinkingOpen = Boolean(openThinking[q.id]);

          return (
            <Card key={q.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  checked={q.selected}
                  onChange={() => void toggleSelect(q.id)}
                  aria-label={`Select question ${q.questionNumber}`}
                  className="mt-1 h-4 w-4 rounded border-line"
                />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">
                      {q.section ? `${q.section} · ` : ''}Q{q.questionNumber}
                    </span>
                    {q.marks !== null ? <Badge tone="neutral">{q.marks} marks</Badge> : null}
                    {q.unclear ? (
                      <Badge tone="warning">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Unclear
                      </Badge>
                    ) : null}
                    {q.instructions ? (
                      <span className="text-xs italic text-muted">{q.instructions}</span>
                    ) : null}
                  </div>

                  {q.unclear && q.unclearReason ? (
                    <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
                      {q.unclearReason}
                    </p>
                  ) : null}

                  {isEditing ? (
                    <div className="space-y-2 rounded-lg border border-line bg-surface2 p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          value={q.questionNumber}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? { ...item, questionNumber: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Question #"
                          className="rounded border border-line bg-bg px-2.5 py-1 text-sm"
                        />
                        <input
                          value={q.section ?? ''}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? { ...item, section: e.target.value || null }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Section (optional)"
                          className="rounded border border-line bg-bg px-2.5 py-1 text-sm"
                        />
                        <input
                          type="number"
                          min={1}
                          value={q.marks ?? ''}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? {
                                      ...item,
                                      marks: e.target.value ? Number(e.target.value) : null,
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Marks"
                          className="rounded border border-line bg-bg px-2.5 py-1 text-sm"
                        />
                      </div>
                      <textarea
                        rows={4}
                        value={q.prompt}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === q.id ? { ...item, prompt: e.target.value } : item,
                            ),
                          )
                        }
                        className="w-full rounded border border-line bg-bg p-2 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(null);
                            setQuestions(detail.extractedQuestions);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={savingEdits}
                          onClick={() => {
                            setEditingId(null);
                            void persistQuestions(questions);
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-fg">{q.prompt}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(isEditing ? null : q.id)}
                    >
                      <Edit3 className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {idx < questions.length - 1 ? (
                      <Button size="sm" variant="ghost" onClick={() => void mergeWithNext(idx)}>
                        <GitMerge className="mr-1 h-3.5 w-3.5" />
                        Merge next
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => void splitQuestion(idx)}>
                      <Scissors className="mr-1 h-3.5 w-3.5" />
                      Split
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isStreamingThis || batchRunning}
                      onClick={() => void answerSingleQuestion(q)}
                    >
                      {isStreamingThis ? 'Answering…' : q.answerMarkdown ? 'Re-answer' : 'Answer'}
                    </Button>
                  </div>

                  {q.thinkingMarkdown && !isStreamingThis ? (
                    <div className="mt-3 rounded-lg border border-line bg-surface2/70">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenThinking((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                        }
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted hover:text-fg"
                      >
                        {thinkingOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Show thinking
                      </button>
                      {thinkingOpen ? (
                        <div className="border-t border-line px-3 py-2 text-sm">
                          <MarkdownContent content={q.thinkingMarkdown} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {liveAnswer ? (
                    <div className="mt-3 rounded-lg border border-line bg-surface p-4">
                      {Array.isArray(q.citedSourcesJson) && q.citedSourcesJson.length > 0 ? (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>Sources checked:</span>
                          {q.citedSourcesJson.map((s) => (
                            <Badge key={s} tone="neutral">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <MarkdownContent content={liveAnswer} />

                      {!isStreamingThis ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void answerSingleQuestion(q, 'regenerate')}
                          >
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            Regenerate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void answerSingleQuestion(q, 'simpler')}
                          >
                            Explain more simply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void answerSingleQuestion(q, 'another_method')}
                          >
                            Show another method
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void handleCopy(q)}>
                            {copiedId === q.id ? (
                              <>
                                <Check className="mr-1 h-3.5 w-3.5 text-success" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1 h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              navigate(appPath('/chat'), {
                                state: {
                                  prefill: `Quiz me on this question and its underlying concept:\n\n${q.prompt}`,
                                },
                              })
                            }
                          >
                            <HelpCircle className="mr-1 h-3.5 w-3.5" />
                            Quiz me on this
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
