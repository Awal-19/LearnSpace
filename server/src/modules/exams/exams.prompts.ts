export const REVISION_PLAN_SYSTEM_PROMPT = `You are an expert university study coach inside LearnSpace.
Create realistic, well-paced day-by-day revision schedules leading up to exams.
Return ONLY valid JSON (no markdown fences) matching:
{
  "title": "Short descriptive plan title",
  "sessions": [
    {
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "durationMinutes": 60,
      "courseId": "uuid or null",
      "examId": "uuid or null",
      "topic": "Specific concrete topic or weak area to revise",
      "notes": "Actionable study focus (e.g. Solve 5 past questions + review weak concepts)"
    }
  ]
}
Rules:
- Use ONLY dates explicitly listed under "Available study dates". NEVER schedule on days off.
- Never exceed daily study budget (hoursPerDay * 60 minutes) per date.
- Start sessions at times matching the student's preferred study windows (morning ~08:30-11:30, afternoon ~13:30-17:00, evening ~18:00-21:00, night ~21:00-23:00).
- Prioritize identified weak topics early and revisit difficult subjects before exam day (spaced practice + active recall).
- Order sessions chronologically by scheduledDate then startTime.
- Schedule sessions strictly on or before each exam's date when revising for that exam.
- Produce focused sessions of 30 to 120 minutes each; output at least 2 sessions and at most 60 sessions.`;

export interface PromptExamContext {
  examId: string;
  courseId: string;
  courseLabel: string;
  title: string;
  examType: string;
  localDate: string;
  weightPercent: number | null;
  topics: string[];
  notes: string[];
  documents: string[];
  weakTopics: string[];
}

export function buildRevisionPlanPrompt(params: {
  validDates: Array<{ dateStr: string; weekdayLabel: string }>;
  hoursPerDay: number;
  preferredTimes: string[];
  exams: PromptExamContext[];
  instructions?: string;
}): string {
  const maxMinsPerDay = Math.round(params.hoursPerDay * 60);
  const datesBlock = params.validDates
    .slice(0, 45)
    .map((d) => `${d.dateStr} (${d.weekdayLabel})`)
    .join(', ');

  const examsBlock = params.exams
    .map((ex, i) => {
      const weightStr = ex.weightPercent !== null ? ` · Weight: ${ex.weightPercent}%` : '';
      const lines = [
        `${i + 1}. Exam ID: ${ex.examId} | Course ID: ${ex.courseId} | ${ex.courseLabel} — ${ex.title} (${ex.examType}) on ${ex.localDate}${weightStr}`,
        `   Syllabus topics: ${ex.topics.length > 0 ? ex.topics.join('; ') : 'General course review'}`,
        `   Weak topics to prioritize: ${ex.weakTopics.length > 0 ? ex.weakTopics.join('; ') : 'None flagged yet'}`,
      ];
      if (ex.notes.length > 0) {
        lines.push(`   Student notes: ${ex.notes.join(' | ')}`);
      }
      if (ex.documents.length > 0) {
        lines.push(`   Course documents: ${ex.documents.join(' | ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const extra = params.instructions?.trim()
    ? `\nAdditional student preference:\n${params.instructions.trim()}`
    : '';

  return `Generate a personalized day-by-day revision plan for the student.

Available study dates (${params.validDates.length} days, days off already excluded):
${datesBlock}

Study capacity & preferences:
- Daily capacity: up to ${params.hoursPerDay} hours (${maxMinsPerDay} minutes/day max)
- Preferred study windows: ${params.preferredTimes.join(', ')}${extra}

Exams & real course study context:
${examsBlock}

Return the JSON revision schedule now.`;
}
