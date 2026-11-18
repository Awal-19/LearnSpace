import type { RetakePolicy } from '@prisma/client';

export interface GradeBoundary {
  label: string;
  minScore: number;
  maxScore: number;
  gradePoint: number;
  isPass: boolean;
  excludeFromGpa?: boolean;
}

export interface DegreeClassRule {
  label: string;
  minGpa: number;
}

export interface GpaScaleConfig {
  id: string;
  name: string;
  maxGpa: number;
  retakePolicy: RetakePolicy;
  boundaries: GradeBoundary[];
  degreeClasses: DegreeClassRule[];
  isDefault: boolean;
}

export interface GradeRecordInputRow {
  id: string;
  courseId: string | null;
  scaleId: string | null;
  semester: string;
  semesterOrder: number;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  score: number | null;
  gradeLabel: string;
  gradePoint: number;
  excludeFromGpa: boolean;
  isRetake: boolean;
  retakeGroupKey: string | null;
  createdAt: Date;
}

export interface AnnotatedGradeRecord extends GradeRecordInputRow {
  qualityPoints: number;
  countsInSemesterGpa: boolean;
  countsInCgpa: boolean;
  supersededByRetake: boolean;
  effectiveRetakeKey: string | null;
}

export interface SemesterSummary {
  semester: string;
  semesterOrder: number;
  courseCount: number;
  gpaCredits: number;
  totalCredits: number;
  qualityPoints: number;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  cumulativeCredits: number;
  records: AnnotatedGradeRecord[];
}

export interface GpaTrendPoint {
  semester: string;
  semesterOrder: number;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  gpaCredits: number;
  cumulativeCredits: number;
}

export interface GpaOverviewResult {
  totalCourses: number;
  completedGpaCredits: number;
  totalAttemptedCredits: number;
  totalQualityPoints: number;
  cgpa: number | null;
  rawCgpa: number | null;
  currentClassLabel: string | null;
  semesters: SemesterSummary[];
  trend: GpaTrendPoint[];
}

export interface GradingScalePreset {
  key: 'default_4_0' | 'us_plus_minus_4_0' | 'scale_5_0';
  name: string;
  maxGpa: number;
  retakePolicy: RetakePolicy;
  boundaries: GradeBoundary[];
  degreeClasses: DegreeClassRule[];
}

export const GRADING_SCALE_PRESETS: Record<GradingScalePreset['key'], GradingScalePreset> = {
  default_4_0: {
    key: 'default_4_0',
    name: 'University 4.0 Scale',
    maxGpa: 4.0,
    retakePolicy: 'latest',
    boundaries: [
      { label: 'A', minScore: 80, maxScore: 100, gradePoint: 4.0, isPass: true },
      { label: 'B+', minScore: 75, maxScore: 79.99, gradePoint: 3.5, isPass: true },
      { label: 'B', minScore: 70, maxScore: 74.99, gradePoint: 3.0, isPass: true },
      { label: 'C+', minScore: 65, maxScore: 69.99, gradePoint: 2.5, isPass: true },
      { label: 'C', minScore: 60, maxScore: 64.99, gradePoint: 2.0, isPass: true },
      { label: 'D+', minScore: 55, maxScore: 59.99, gradePoint: 1.5, isPass: true },
      { label: 'D', minScore: 50, maxScore: 54.99, gradePoint: 1.0, isPass: true },
      { label: 'E', minScore: 45, maxScore: 49.99, gradePoint: 0.5, isPass: false },
      { label: 'F', minScore: 0, maxScore: 44.99, gradePoint: 0.0, isPass: false },
    ],
    degreeClasses: [
      { label: 'First Class', minGpa: 3.6 },
      { label: 'Second Class Upper', minGpa: 3.0 },
      { label: 'Second Class Lower', minGpa: 2.0 },
      { label: 'Third Class / Pass', minGpa: 1.0 },
    ],
  },
  us_plus_minus_4_0: {
    key: 'us_plus_minus_4_0',
    name: '4.0 Plus/Minus Scale',
    maxGpa: 4.0,
    retakePolicy: 'latest',
    boundaries: [
      { label: 'A', minScore: 93, maxScore: 100, gradePoint: 4.0, isPass: true },
      { label: 'A-', minScore: 90, maxScore: 92.99, gradePoint: 3.7, isPass: true },
      { label: 'B+', minScore: 87, maxScore: 89.99, gradePoint: 3.3, isPass: true },
      { label: 'B', minScore: 83, maxScore: 86.99, gradePoint: 3.0, isPass: true },
      { label: 'B-', minScore: 80, maxScore: 82.99, gradePoint: 2.7, isPass: true },
      { label: 'C+', minScore: 77, maxScore: 79.99, gradePoint: 2.3, isPass: true },
      { label: 'C', minScore: 73, maxScore: 76.99, gradePoint: 2.0, isPass: true },
      { label: 'C-', minScore: 70, maxScore: 72.99, gradePoint: 1.7, isPass: true },
      { label: 'D', minScore: 60, maxScore: 69.99, gradePoint: 1.0, isPass: true },
      { label: 'F', minScore: 0, maxScore: 59.99, gradePoint: 0.0, isPass: false },
    ],
    degreeClasses: [
      { label: 'Summa Cum Laude', minGpa: 3.9 },
      { label: 'Magna Cum Laude', minGpa: 3.7 },
      { label: 'Cum Laude', minGpa: 3.5 },
      { label: 'Good Standing', minGpa: 2.0 },
    ],
  },
  scale_5_0: {
    key: 'scale_5_0',
    name: '5.0 Scale',
    maxGpa: 5.0,
    retakePolicy: 'latest',
    boundaries: [
      { label: 'A', minScore: 70, maxScore: 100, gradePoint: 5.0, isPass: true },
      { label: 'B', minScore: 60, maxScore: 69.99, gradePoint: 4.0, isPass: true },
      { label: 'C', minScore: 50, maxScore: 59.99, gradePoint: 3.0, isPass: true },
      { label: 'D', minScore: 45, maxScore: 49.99, gradePoint: 2.0, isPass: true },
      { label: 'E', minScore: 40, maxScore: 44.99, gradePoint: 1.0, isPass: true },
      { label: 'F', minScore: 0, maxScore: 39.99, gradePoint: 0.0, isPass: false },
    ],
    degreeClasses: [
      { label: 'First Class', minGpa: 4.5 },
      { label: 'Second Class Upper', minGpa: 3.5 },
      { label: 'Second Class Lower', minGpa: 2.4 },
      { label: 'Third Class', minGpa: 1.5 },
    ],
  },
};

export function roundGpa(val: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function normalizeCourseKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export function resolveBoundaryFromScore(
  boundaries: GradeBoundary[],
  score: number,
): GradeBoundary | null {
  const sorted = [...boundaries].sort((a, b) => b.minScore - a.minScore);
  const direct = sorted.find((b) => score >= b.minScore && score <= b.maxScore);
  if (direct) return direct;
  return sorted.find((b) => score >= b.minScore) ?? sorted.at(-1) ?? null;
}

export function resolveBoundaryFromLabel(
  boundaries: GradeBoundary[],
  label: string,
): GradeBoundary | null {
  const needle = label.trim().toLowerCase();
  if (!needle) return null;
  return boundaries.find((b) => b.label.trim().toLowerCase() === needle) ?? null;
}

export function computeGpaOverview(
  records: GradeRecordInputRow[],
  scale: Pick<GpaScaleConfig, 'retakePolicy' | 'degreeClasses'>,
): GpaOverviewResult {
  const ordered = [...records].sort(
    (a, b) =>
      a.semesterOrder - b.semesterOrder ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  // Determine effective retake groups (any explicit retakeGroupKey, OR duplicate courseCode, OR isRetake + courseCode).
  const keyCounts = new Map<string, number>();
  const rowCandidateKey = new Map<string, string | null>();
  for (const r of ordered) {
    const key = normalizeCourseKey(r.retakeGroupKey || r.courseCode);
    if (key) {
      rowCandidateKey.set(r.id, key);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    } else {
      rowCandidateKey.set(r.id, null);
    }
  }

  const groupRows = new Map<string, GradeRecordInputRow[]>();
  for (const r of ordered) {
    const key = rowCandidateKey.get(r.id);
    if (!key) continue;
    if ((keyCounts.get(key) ?? 0) > 1 || r.isRetake || Boolean(r.retakeGroupKey)) {
      const list = groupRows.get(key) ?? [];
      list.push(r);
      groupRows.set(key, list);
    }
  }

  const winningAttemptByGroup = new Map<string, string>();
  if (scale.retakePolicy !== 'include_all') {
    for (const [key, list] of groupRows.entries()) {
      const counted = list.filter((r) => !r.excludeFromGpa);
      const pool = counted.length > 0 ? counted : list;
      if (pool.length === 0) continue;

      if (scale.retakePolicy === 'latest') {
        winningAttemptByGroup.set(key, pool[pool.length - 1]!.id);
      } else {
        // highest gradePoint (tie-breaker: latest)
        let best = pool[0]!;
        for (const cand of pool) {
          if (cand.gradePoint >= best.gradePoint) {
            best = cand;
          }
        }
        winningAttemptByGroup.set(key, best.id);
      }
    }
  }

  const annotated: AnnotatedGradeRecord[] = ordered.map((r) => {
    const candidateKey = rowCandidateKey.get(r.id) ?? null;
    const isGrouped = Boolean(candidateKey && groupRows.has(candidateKey));
    const winnerId =
      isGrouped && candidateKey ? winningAttemptByGroup.get(candidateKey) : undefined;
    const supersededByRetake =
      scale.retakePolicy !== 'include_all' &&
      isGrouped &&
      winnerId !== undefined &&
      winnerId !== r.id &&
      !r.excludeFromGpa;

    const countsInSemesterGpa = !r.excludeFromGpa && r.creditHours > 0;
    const countsInCgpa = countsInSemesterGpa && !supersededByRetake;
    const qualityPoints = r.excludeFromGpa ? 0 : r.creditHours * r.gradePoint;

    return {
      ...r,
      qualityPoints,
      countsInSemesterGpa,
      countsInCgpa,
      supersededByRetake,
      effectiveRetakeKey: isGrouped ? candidateKey : null,
    };
  });

  // Group chronologically into semesters (distinct semesterOrder + semester label)
  const semesterMap = new Map<
    string,
    {
      semester: string;
      semesterOrder: number;
      records: AnnotatedGradeRecord[];
    }
  >();

  for (const r of annotated) {
    const semKey = `${r.semesterOrder}::${r.semester}`;
    const bucket = semesterMap.get(semKey) ?? {
      semester: r.semester,
      semesterOrder: r.semesterOrder,
      records: [],
    };
    bucket.records.push(r);
    semesterMap.set(semKey, bucket);
  }

  const orderedSemesters = Array.from(semesterMap.values()).sort(
    (a, b) => a.semesterOrder - b.semesterOrder || a.semester.localeCompare(b.semester),
  );

  // Track cumulative CGPA progressively while applying retake superseding ONLY to prior attempts seen up to that semester,
  // OR overall CGPA using full retake policy. Here cumulative progression naturally uses the final effective CGPA rules up to each term
  // so retaking in Semester N recalculates progressive trend cleanly from Semester N onwards without distorting historical term GPAs!
  let totalAttemptedCredits = 0;
  let runningCgpaCredits = 0;
  let runningCgpaPoints = 0;
  const semesters: SemesterSummary[] = [];
  const trend: GpaTrendPoint[] = [];

  // Re-evaluate cumulative up-to-semester using attempts present through each semester so historical checkpoints reflect what the student actually had at that point!
  for (let semIdx = 0; semIdx < orderedSemesters.length; semIdx += 1) {
    const sem = orderedSemesters[semIdx]!;
    let semGpaCredits = 0;
    let semQualityPoints = 0;
    let semTotalCredits = 0;

    for (const r of sem.records) {
      semTotalCredits += r.creditHours;
      totalAttemptedCredits += r.creditHours;
      if (r.countsInSemesterGpa) {
        semGpaCredits += r.creditHours;
        semQualityPoints += r.qualityPoints;
      }
      if (r.countsInCgpa) {
        runningCgpaCredits += r.creditHours;
        runningCgpaPoints += r.qualityPoints;
      }
    }

    // Also compute progressive point-in-time CGPA across semesters 0..semIdx cleanly
    const prefixRecords = orderedSemesters.slice(0, semIdx + 1).flatMap((s) => s.records);
    const pointInTimeCgpa = computePointInTimeCgpa(prefixRecords, scale.retakePolicy);

    const semesterGpa = semGpaCredits > 0 ? roundGpa(semQualityPoints / semGpaCredits, 2) : null;

    semesters.push({
      semester: sem.semester,
      semesterOrder: sem.semesterOrder,
      courseCount: sem.records.length,
      gpaCredits: semGpaCredits,
      totalCredits: semTotalCredits,
      qualityPoints: roundGpa(semQualityPoints, 4),
      semesterGpa,
      cumulativeGpa: pointInTimeCgpa.cgpa,
      cumulativeCredits: pointInTimeCgpa.credits,
      records: sem.records,
    });

    trend.push({
      semester: sem.semester,
      semesterOrder: sem.semesterOrder,
      semesterGpa,
      cumulativeGpa: pointInTimeCgpa.cgpa,
      gpaCredits: semGpaCredits,
      cumulativeCredits: pointInTimeCgpa.credits,
    });
  }

  const rawCgpa = runningCgpaCredits > 0 ? runningCgpaPoints / runningCgpaCredits : null;
  const cgpa = rawCgpa !== null ? roundGpa(rawCgpa, 2) : null;

  let currentClassLabel: string | null = null;
  if (cgpa !== null && scale.degreeClasses.length > 0) {
    const sortedClasses = [...scale.degreeClasses].sort((a, b) => b.minGpa - a.minGpa);
    currentClassLabel = sortedClasses.find((c) => cgpa >= c.minGpa)?.label ?? null;
  }

  return {
    totalCourses: annotated.length,
    completedGpaCredits: runningCgpaCredits,
    totalAttemptedCredits,
    totalQualityPoints: roundGpa(runningCgpaPoints, 4),
    cgpa,
    rawCgpa,
    currentClassLabel,
    semesters,
    trend,
  };
}

function computePointInTimeCgpa(
  prefixRecords: AnnotatedGradeRecord[],
  retakePolicy: RetakePolicy,
): { cgpa: number | null; credits: number } {
  const grouped = new Map<string, AnnotatedGradeRecord[]>();
  for (const r of prefixRecords) {
    if (!r.effectiveRetakeKey || r.excludeFromGpa) continue;
    const list = grouped.get(r.effectiveRetakeKey) ?? [];
    list.push(r);
    grouped.set(r.effectiveRetakeKey, list);
  }

  const winners = new Map<string, string>();
  if (retakePolicy !== 'include_all') {
    for (const [k, list] of grouped.entries()) {
      if (retakePolicy === 'latest') {
        winners.set(k, list[list.length - 1]!.id);
      } else {
        let best = list[0]!;
        for (const item of list) {
          if (item.gradePoint >= best.gradePoint) best = item;
        }
        winners.set(k, best.id);
      }
    }
  }

  let credits = 0;
  let points = 0;
  for (const r of prefixRecords) {
    if (!r.countsInSemesterGpa) continue;
    if (
      retakePolicy !== 'include_all' &&
      r.effectiveRetakeKey &&
      winners.get(r.effectiveRetakeKey) !== r.id
    ) {
      continue;
    }
    credits += r.creditHours;
    points += r.qualityPoints;
  }

  return {
    cgpa: credits > 0 ? roundGpa(points / credits, 2) : null,
    credits,
  };
}

export interface PlannedCourseTarget {
  label: string;
  creditHours: number;
}

export interface WhatIfCourseRecommendation {
  label: string;
  creditHours: number;
  suggestedGrade: string;
  gradePoint: number;
}

export interface WhatIfPlanResult {
  possible: boolean;
  alreadyAchieved: boolean;
  targetCgpa: number;
  targetClassLabel: string | null;
  currentCgpa: number | null;
  completedGpaCredits: number;
  remainingCredits: number;
  maxAchievableCgpa: number;
  minPossibleCgpa: number;
  requiredAvgGpa: number | null;
  suggestedMinGrade: { label: string; gradePoint: number } | null;
  courseBreakdown: WhatIfCourseRecommendation[];
  message: string;
}

export function computeWhatIfPlan(
  overview: GpaOverviewResult,
  scale: Pick<GpaScaleConfig, 'maxGpa' | 'boundaries' | 'degreeClasses'>,
  opts: {
    targetCgpa?: number;
    targetClassLabel?: string;
    remainingCredits?: number;
    plannedCourses?: PlannedCourseTarget[];
  },
): WhatIfPlanResult {
  let targetCgpa = opts.targetCgpa;
  let resolvedClassLabel: string | null = null;

  if (opts.targetClassLabel) {
    const matched = scale.degreeClasses.find(
      (c) => c.label.trim().toLowerCase() === opts.targetClassLabel!.trim().toLowerCase(),
    );
    if (matched) {
      targetCgpa = matched.minGpa;
      resolvedClassLabel = matched.label;
    }
  }

  if (targetCgpa === undefined || !Number.isFinite(targetCgpa)) {
    throw new Error('Either a valid targetCgpa or targetClassLabel is required');
  }

  const plannedCourses = (opts.plannedCourses ?? []).filter((c) => c.creditHours > 0);
  const plannedCreditsSum = plannedCourses.reduce((s, c) => s + c.creditHours, 0);
  const remainingCredits =
    plannedCourses.length > 0 ? plannedCreditsSum : Math.max(0, opts.remainingCredits ?? 0);

  const completedCredits = overview.completedGpaCredits;
  const currentPoints = overview.totalQualityPoints;
  const currentCgpa = overview.cgpa;

  if (targetCgpa > scale.maxGpa) {
    const maxAchievableCgpa =
      completedCredits + remainingCredits > 0
        ? roundGpa(
            (currentPoints + remainingCredits * scale.maxGpa) /
              (completedCredits + remainingCredits),
            2,
          )
        : scale.maxGpa;
    return {
      possible: false,
      alreadyAchieved: false,
      targetCgpa: roundGpa(targetCgpa, 2),
      targetClassLabel: resolvedClassLabel,
      currentCgpa,
      completedGpaCredits: completedCredits,
      remainingCredits,
      maxAchievableCgpa,
      minPossibleCgpa:
        completedCredits + remainingCredits > 0
          ? roundGpa(currentPoints / (completedCredits + remainingCredits), 2)
          : 0,
      requiredAvgGpa: null,
      suggestedMinGrade: null,
      courseBreakdown: [],
      message: `Target CGPA (${targetCgpa.toFixed(2)}) exceeds your grading scale maximum of ${scale.maxGpa.toFixed(2)}.`,
    };
  }

  if (remainingCredits <= 0) {
    const alreadyAchieved = currentCgpa !== null && currentCgpa >= targetCgpa;
    return {
      possible: alreadyAchieved,
      alreadyAchieved,
      targetCgpa: roundGpa(targetCgpa, 2),
      targetClassLabel: resolvedClassLabel,
      currentCgpa,
      completedGpaCredits: completedCredits,
      remainingCredits: 0,
      maxAchievableCgpa: currentCgpa ?? scale.maxGpa,
      minPossibleCgpa: currentCgpa ?? 0,
      requiredAvgGpa: null,
      suggestedMinGrade: null,
      courseBreakdown: [],
      message: alreadyAchieved
        ? `Your current CGPA (${currentCgpa?.toFixed(2)}) already meets the ${targetCgpa.toFixed(2)} target.`
        : 'Add at least one remaining credit hour (> 0) to calculate the grades needed.',
    };
  }

  const totalFutureCredits = completedCredits + remainingCredits;
  const maxAchievableRaw = (currentPoints + remainingCredits * scale.maxGpa) / totalFutureCredits;
  const minPossibleRaw = currentPoints / totalFutureCredits;
  const maxAchievableCgpa = roundGpa(maxAchievableRaw, 2);
  const minPossibleCgpa = roundGpa(minPossibleRaw, 2);

  const requiredPoints = targetCgpa * totalFutureCredits - currentPoints;
  const rawRequiredAvg = requiredPoints / remainingCredits;
  const requiredAvgGpa = roundGpa(Math.max(0, rawRequiredAvg), 2);

  if (rawRequiredAvg > scale.maxGpa + 1e-9) {
    return {
      possible: false,
      alreadyAchieved: false,
      targetCgpa: roundGpa(targetCgpa, 2),
      targetClassLabel: resolvedClassLabel,
      currentCgpa,
      completedGpaCredits: completedCredits,
      remainingCredits,
      maxAchievableCgpa,
      minPossibleCgpa,
      requiredAvgGpa: roundGpa(rawRequiredAvg, 2),
      suggestedMinGrade: null,
      courseBreakdown: [],
      message: `Impossible with ${remainingCredits} remaining credits: you would need an average GPA of ${rawRequiredAvg.toFixed(2)}, above the scale max of ${scale.maxGpa.toFixed(2)}. Maximum achievable CGPA is ${maxAchievableCgpa.toFixed(2)}.`,
    };
  }

  const activeBoundaries = [...scale.boundaries]
    .filter((b) => !b.excludeFromGpa)
    .sort((a, b) => a.gradePoint - b.gradePoint);

  const clampedAvg = Math.max(0, rawRequiredAvg);
  const suggestedBoundary =
    activeBoundaries.find((b) => b.gradePoint + 1e-9 >= clampedAvg) ??
    activeBoundaries[activeBoundaries.length - 1] ??
    null;

  const courseBreakdown: WhatIfCourseRecommendation[] = [];
  if (plannedCourses.length > 0 && activeBoundaries.length > 0) {
    const neededPts = Math.max(0, requiredPoints);
    const chosenIndices = plannedCourses.map(() => {
      const idx = activeBoundaries.findIndex((b) => b.gradePoint + 1e-9 >= clampedAvg);
      return idx >= 0 ? idx : activeBoundaries.length - 1;
    });

    // Step down grades gently where possible without dropping below neededPts
    const currentPlannedPts = () =>
      plannedCourses.reduce(
        (sum, c, idx) => sum + c.creditHours * activeBoundaries[chosenIndices[idx]!]!.gradePoint,
        0,
      );

    let improved = true;
    while (improved) {
      improved = false;
      for (let i = plannedCourses.length - 1; i >= 0; i -= 1) {
        const curIdx = chosenIndices[i]!;
        if (curIdx <= 0) continue;
        const delta =
          plannedCourses[i]!.creditHours *
          (activeBoundaries[curIdx]!.gradePoint - activeBoundaries[curIdx - 1]!.gradePoint);
        if (currentPlannedPts() - delta + 1e-9 >= neededPts) {
          chosenIndices[i] = curIdx - 1;
          improved = true;
        }
      }
    }

    // If rounding downward left us below neededPts, step up courses cleanly
    while (currentPlannedPts() + 1e-9 < neededPts) {
      let bumped = false;
      for (let i = 0; i < plannedCourses.length; i += 1) {
        const curIdx = chosenIndices[i]!;
        if (curIdx < activeBoundaries.length - 1) {
          chosenIndices[i] = curIdx + 1;
          bumped = true;
          if (currentPlannedPts() + 1e-9 >= neededPts) break;
        }
      }
      if (!bumped) break;
    }

    for (let i = 0; i < plannedCourses.length; i += 1) {
      const c = plannedCourses[i]!;
      const b = activeBoundaries[chosenIndices[i]!]!;
      courseBreakdown.push({
        label: c.label,
        creditHours: c.creditHours,
        suggestedGrade: b.label,
        gradePoint: b.gradePoint,
      });
    }
  }

  const alreadyAchieved = rawRequiredAvg <= 0;
  const message = alreadyAchieved
    ? `Target achieved: any passing GPA keeps you at or above ${targetCgpa.toFixed(2)} (minimum possible CGPA with zero remaining points is ${minPossibleCgpa.toFixed(2)}).`
    : `You need an average GPA of ${requiredAvgGpa.toFixed(2)} across your ${remainingCredits} remaining credits${suggestedBoundary ? ` (roughly ${suggestedBoundary.label} / ${suggestedBoundary.gradePoint.toFixed(2)} average)` : ''}.`;

  return {
    possible: true,
    alreadyAchieved,
    targetCgpa: roundGpa(targetCgpa, 2),
    targetClassLabel: resolvedClassLabel,
    currentCgpa,
    completedGpaCredits: completedCredits,
    remainingCredits,
    maxAchievableCgpa,
    minPossibleCgpa,
    requiredAvgGpa,
    suggestedMinGrade: suggestedBoundary
      ? { label: suggestedBoundary.label, gradePoint: suggestedBoundary.gradePoint }
      : null,
    courseBreakdown,
    message,
  };
}
