import { describe, expect, it } from 'vitest';
import {
  computeGpaOverview,
  computeWhatIfPlan,
  GRADING_SCALE_PRESETS,
  type GradeRecordInputRow,
} from '../../src/modules/gpa/gpa.math';

function makeRecord(overrides: Partial<GradeRecordInputRow> = {}): GradeRecordInputRow {
  return {
    id: overrides.id ?? 'r-1',
    courseId: null,
    scaleId: 'scale-1',
    semester: 'Year 1 Sem 1',
    semesterOrder: 1,
    courseCode: 'CSCD 101',
    courseTitle: 'Intro to CS',
    creditHours: 3,
    score: 85,
    gradeLabel: 'A',
    gradePoint: 4.0,
    excludeFromGpa: false,
    isRetake: false,
    retakeGroupKey: null,
    createdAt: new Date('2026-01-10T10:00:00Z'),
    ...overrides,
  };
}

describe('GPA & CGPA math engine', () => {
  const scale4 = {
    maxGpa: 4.0,
    retakePolicy: 'latest' as const,
    boundaries: GRADING_SCALE_PRESETS.default_4_0.boundaries,
    degreeClasses: GRADING_SCALE_PRESETS.default_4_0.degreeClasses,
  };

  it('computes weighted semester GPAs, cumulative CGPA without double rounding, and 5.0 scale cleanly', () => {
    const records: GradeRecordInputRow[] = [
      makeRecord({
        id: 'r1',
        semester: 'Y1S1',
        semesterOrder: 1,
        courseCode: 'CS 101',
        creditHours: 3,
        gradeLabel: 'A',
        gradePoint: 4.0,
      }),
      makeRecord({
        id: 'r2',
        semester: 'Y1S1',
        semesterOrder: 1,
        courseCode: 'MATH 101',
        creditHours: 4,
        gradeLabel: 'B',
        gradePoint: 3.0,
      }),
      makeRecord({
        id: 'r3',
        semester: 'Y1S2',
        semesterOrder: 2,
        courseCode: 'CS 102',
        creditHours: 3,
        gradeLabel: 'B+',
        gradePoint: 3.5,
      }),
    ];

    const res = computeGpaOverview(records, scale4);
    // Y1S1: (3*4 + 4*3) / 7 = 24 / 7 = 3.42857 -> 3.43
    expect(res.semesters[0]?.semesterGpa).toBe(3.43);
    expect(res.semesters[0]?.cumulativeGpa).toBe(3.43);
    // Y1S2: (3*3.5) / 3 = 3.50
    expect(res.semesters[1]?.semesterGpa).toBe(3.5);
    // Total CGPA: (24 + 10.5) / 10 = 34.5 / 10 = 3.45
    expect(res.cgpa).toBe(3.45);
    expect(res.completedGpaCredits).toBe(10);
    expect(res.currentClassLabel).toBe('Second Class Upper');

    // Configurable 5.0 scale support
    const scale5 = computeGpaOverview(
      [
        makeRecord({ id: 'p1', creditHours: 3, gradeLabel: 'A', gradePoint: 5.0 }),
        makeRecord({
          id: 'p2',
          creditHours: 3,
          courseCode: 'PHY 101',
          gradeLabel: 'B',
          gradePoint: 4.0,
        }),
      ],
      {
        retakePolicy: 'latest',
        degreeClasses: GRADING_SCALE_PRESETS.scale_5_0.degreeClasses,
      },
    );
    expect(scale5.cgpa).toBe(4.5);
    expect(scale5.currentClassLabel).toBe('First Class');
  });

  it('handles zero-credit courses cleanly without NaN or divide-by-zero', () => {
    const onlyZero = computeGpaOverview(
      [
        makeRecord({
          id: 'z1',
          semester: 'Orientation',
          semesterOrder: 1,
          creditHours: 0,
          gradeLabel: 'A',
          gradePoint: 4.0,
        }),
      ],
      scale4,
    );
    expect(onlyZero.semesters[0]?.semesterGpa).toBeNull();
    expect(onlyZero.cgpa).toBeNull();
    expect(onlyZero.completedGpaCredits).toBe(0);

    const mixed = computeGpaOverview(
      [
        makeRecord({
          id: 'z1',
          creditHours: 0,
          courseCode: 'LAB 100',
          gradeLabel: 'F',
          gradePoint: 0.0,
        }),
        makeRecord({
          id: 'c1',
          creditHours: 3,
          courseCode: 'CS 101',
          gradeLabel: 'A',
          gradePoint: 4.0,
        }),
      ],
      scale4,
    );
    expect(mixed.semesters[0]?.semesterGpa).toBe(4.0);
    expect(mixed.cgpa).toBe(4.0);
    expect(mixed.completedGpaCredits).toBe(3);
    expect(mixed.totalAttemptedCredits).toBe(3);
  });

  it('handles retake policies (latest replaces prior in CGPA while keeping historical semester GPA, vs highest vs include_all)', () => {
    const records: GradeRecordInputRow[] = [
      makeRecord({
        id: 'a1',
        semester: 'Y1S1',
        semesterOrder: 1,
        courseCode: 'CSCD 204',
        creditHours: 3,
        gradeLabel: 'F',
        gradePoint: 0.0,
      }),
      makeRecord({
        id: 'a2',
        semester: 'Y1S1',
        semesterOrder: 1,
        courseCode: 'MATH 201',
        creditHours: 3,
        gradeLabel: 'A',
        gradePoint: 4.0,
      }),
      makeRecord({
        id: 'a3',
        semester: 'Y1S2',
        semesterOrder: 2,
        courseCode: 'cscd204',
        creditHours: 3,
        gradeLabel: 'B',
        gradePoint: 3.0,
        isRetake: true,
      }),
    ];

    const latestRes = computeGpaOverview(records, { ...scale4, retakePolicy: 'latest' });
    // Y1S1 term GPA keeps F + A = (0 + 12) / 6 = 2.00
    expect(latestRes.semesters[0]?.semesterGpa).toBe(2.0);
    // Point-in-time Y1S1 CGPA = 2.00; after retake in Y1S2: CSCD 204 counts once with 3.0 -> (12 + 9) / 6 = 3.50
    expect(latestRes.semesters[0]?.cumulativeGpa).toBe(2.0);
    expect(latestRes.semesters[1]?.cumulativeGpa).toBe(3.5);
    expect(latestRes.cgpa).toBe(3.5);
    expect(latestRes.completedGpaCredits).toBe(6);
    expect(latestRes.semesters[0]?.records[0]?.supersededByRetake).toBe(true);

    // Highest policy picks highest point even if later retake was lower
    const withLowerRetake = [
      makeRecord({
        id: 'b1',
        semester: 'Y1S1',
        semesterOrder: 1,
        courseCode: 'CS 101',
        creditHours: 3,
        gradeLabel: 'B+',
        gradePoint: 3.5,
      }),
      makeRecord({
        id: 'b2',
        semester: 'Y1S2',
        semesterOrder: 2,
        courseCode: 'CS 101',
        creditHours: 3,
        gradeLabel: 'C',
        gradePoint: 2.0,
        isRetake: true,
      }),
    ];
    const highestRes = computeGpaOverview(withLowerRetake, { ...scale4, retakePolicy: 'highest' });
    expect(highestRes.cgpa).toBe(3.5);

    // Include_all policy counts every attempt in CGPA
    const allRes = computeGpaOverview(records, { ...scale4, retakePolicy: 'include_all' });
    // (0 + 12 + 9) / 9 = 21 / 9 = 2.33
    expect(allRes.cgpa).toBe(2.33);
    expect(allRes.completedGpaCredits).toBe(9);
  });

  it('calculates What-If plans including possible, impossible (> maxGpa), already achieved, and planned course grade recommendations', () => {
    // 60 credits @ 3.20 CGPA -> 192 points
    const overview = computeGpaOverview(
      [
        makeRecord({
          id: 'm1',
          creditHours: 30,
          courseCode: 'CORE1',
          gradeLabel: 'B',
          gradePoint: 3.0,
        }),
        makeRecord({
          id: 'm2',
          creditHours: 30,
          courseCode: 'CORE2',
          gradeLabel: 'B+',
          gradePoint: 3.4,
        }),
      ],
      scale4,
    );
    expect(overview.cgpa).toBe(3.2);

    // Target First Class (3.60) with 30 remaining credits:
    // Total points needed = 3.60 * 90 = 324 -> remaining needed = 132 -> 132 / 30 = 4.40 > 4.00 => IMPOSSIBLE!
    const impossible = computeWhatIfPlan(overview, scale4, {
      targetClassLabel: 'First Class',
      remainingCredits: 30,
    });
    expect(impossible.possible).toBe(false);
    expect(impossible.requiredAvgGpa).toBe(4.4);
    expect(impossible.maxAchievableCgpa).toBe(3.47);
    expect(impossible.message).toMatch(/impossible/i);

    // Target 3.40 with 30 remaining credits -> (3.40 * 90 - 192) / 30 = 114 / 30 = 3.80 => POSSIBLE
    const achievable = computeWhatIfPlan(overview, scale4, {
      targetCgpa: 3.4,
      plannedCourses: [
        { label: 'CS 401', creditHours: 15 },
        { label: 'CS 402', creditHours: 15 },
      ],
    });
    expect(achievable.possible).toBe(true);
    expect(achievable.requiredAvgGpa).toBe(3.8);
    expect(achievable.courseBreakdown).toHaveLength(2);
    const totalSuggestedPts = achievable.courseBreakdown.reduce(
      (s, c) => s + c.creditHours * c.gradePoint,
      0,
    );
    expect(totalSuggestedPts).toBeGreaterThanOrEqual(114);

    // Already locked in (target 2.00 with 10 credits left -> max minimum is 192 / 70 = 2.74 >= 2.00)
    const locked = computeWhatIfPlan(overview, scale4, {
      targetCgpa: 2.0,
      remainingCredits: 10,
    });
    expect(locked.possible).toBe(true);
    expect(locked.alreadyAchieved).toBe(true);
    expect(locked.requiredAvgGpa).toBe(0);
  });
});
