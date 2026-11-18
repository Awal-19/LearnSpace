import type { GradingScale, Prisma, PrismaClient, RetakePolicy } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import {
  computeGpaOverview,
  computeWhatIfPlan,
  GRADING_SCALE_PRESETS,
  normalizeCourseKey,
  resolveBoundaryFromLabel,
  resolveBoundaryFromScore,
  type DegreeClassRule,
  type GradeBoundary,
  type GpaScaleConfig,
} from './gpa.math';
import type {
  CreateGradeRecordInput,
  CreateScaleInput,
  UpdateGradeRecordInput,
  UpdateScaleInput,
  WhatIfPlanInput,
} from './gpa.schemas';

export interface GpaServiceDeps {
  prisma: PrismaClient;
  logger: Logger;
}

function parseBoundaries(raw: unknown): GradeBoundary[] {
  if (!Array.isArray(raw)) return [];
  return raw as GradeBoundary[];
}

function parseDegreeClasses(raw: unknown): DegreeClassRule[] {
  if (!Array.isArray(raw)) return [];
  return raw as DegreeClassRule[];
}

function toPublicScale(row: GradingScale): GpaScaleConfig {
  return {
    id: row.id,
    name: row.name,
    maxGpa: row.maxGpa,
    retakePolicy: row.retakePolicy,
    boundaries: parseBoundaries(row.boundariesJson),
    degreeClasses: parseDegreeClasses(row.degreeClassesJson),
    isDefault: row.isDefault,
  };
}

function validateScaleNumbers(
  maxGpa: number,
  boundaries: GradeBoundary[],
  degreeClasses: DegreeClassRule[],
) {
  for (const b of boundaries) {
    if (b.gradePoint > maxGpa) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Grade "${b.label}" point (${b.gradePoint}) cannot exceed max GPA (${maxGpa})`,
      );
    }
  }
  for (const c of degreeClasses) {
    if (c.minGpa > maxGpa) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Degree class "${c.label}" minimum GPA (${c.minGpa}) cannot exceed max GPA (${maxGpa})`,
      );
    }
  }
}

export function createGpaService({ prisma }: GpaServiceDeps) {
  async function ensureDefaultScale(userId: string): Promise<GradingScale[]> {
    const existing = await prisma.gradingScale.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (existing.length > 0) return existing;

    const preset = GRADING_SCALE_PRESETS.default_4_0;
    const created = await prisma.gradingScale.create({
      data: {
        userId,
        name: preset.name,
        maxGpa: preset.maxGpa,
        retakePolicy: preset.retakePolicy,
        boundariesJson: preset.boundaries as unknown as Prisma.InputJsonValue,
        degreeClassesJson: preset.degreeClasses as unknown as Prisma.InputJsonValue,
        isDefault: true,
      },
    });
    return [created];
  }

  async function resolveActiveAndAllScales(userId: string) {
    const rows = await ensureDefaultScale(userId);
    const scales = rows.map(toPublicScale);
    const activeScale = scales.find((s) => s.isDefault) ?? scales[0]!;
    return { activeScale, scales };
  }

  async function computeOverviewForUser(userId: string) {
    const [{ activeScale, scales }, records] = await Promise.all([
      resolveActiveAndAllScales(userId),
      prisma.gradeRecord.findMany({
        where: { userId },
        orderBy: [{ semesterOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const overview = computeGpaOverview(
      records.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        scaleId: r.scaleId,
        semester: r.semester,
        semesterOrder: r.semesterOrder,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        creditHours: r.creditHours,
        score: r.score,
        gradeLabel: r.gradeLabel,
        gradePoint: r.gradePoint,
        excludeFromGpa: r.excludeFromGpa,
        isRetake: r.isRetake,
        retakeGroupKey: r.retakeGroupKey,
        createdAt: r.createdAt,
      })),
      activeScale,
    );

    return {
      activeScale,
      scales,
      presets: Object.values(GRADING_SCALE_PRESETS),
      overview,
    };
  }

  async function assertCourseOwnedIfPresent(userId: string, courseId?: string | null) {
    if (!courseId) return;
    const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
  }

  async function resolveScaleByIdOrDefault(
    userId: string,
    scaleId?: string | null,
  ): Promise<GpaScaleConfig> {
    if (scaleId) {
      const found = await prisma.gradingScale.findFirst({ where: { id: scaleId, userId } });
      if (!found) throw new AppError('NOT_FOUND', 'Grading scale not found');
      return toPublicScale(found);
    }
    const { activeScale } = await resolveActiveAndAllScales(userId);
    return activeScale;
  }

  function resolveGradeValues(
    scale: GpaScaleConfig,
    input: {
      score?: number | null;
      gradeLabel?: string;
      gradePoint?: number;
      excludeFromGpa?: boolean;
    },
  ): {
    score: number | null;
    gradeLabel: string;
    gradePoint: number;
    excludeFromGpa: boolean;
  } {
    const score = input.score !== undefined ? input.score : null;
    let boundary = null;

    if (score !== null) {
      boundary = resolveBoundaryFromScore(scale.boundaries, score);
    }
    if (!boundary && input.gradeLabel) {
      boundary = resolveBoundaryFromLabel(scale.boundaries, input.gradeLabel);
    }

    const gradeLabel = (input.gradeLabel?.trim() || boundary?.label || '').slice(0, 12);
    if (!gradeLabel) {
      throw new AppError('VALIDATION_ERROR', 'Could not resolve a grade label from your scale');
    }

    const gradePoint =
      input.gradePoint !== undefined
        ? input.gradePoint
        : boundary !== null
          ? boundary.gradePoint
          : undefined;

    if (gradePoint === undefined) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Grade "${gradeLabel}" is not defined in "${scale.name}". Choose a boundary label or provide a grade point.`,
      );
    }
    if (gradePoint < 0 || gradePoint > scale.maxGpa) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Grade point (${gradePoint}) must be between 0 and ${scale.maxGpa}`,
      );
    }

    const excludeFromGpa =
      input.excludeFromGpa !== undefined ? input.excludeFromGpa : Boolean(boundary?.excludeFromGpa);

    return { score, gradeLabel, gradePoint, excludeFromGpa };
  }

  return {
    getOverview(userId: string) {
      return computeOverviewForUser(userId);
    },

    async createScale(userId: string, input: CreateScaleInput) {
      validateScaleNumbers(input.maxGpa, input.boundaries, input.degreeClasses);
      await ensureDefaultScale(userId);

      const scale = await prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.gradingScale.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.gradingScale.create({
          data: {
            userId,
            name: input.name,
            maxGpa: input.maxGpa,
            retakePolicy: input.retakePolicy as RetakePolicy,
            boundariesJson: input.boundaries as unknown as Prisma.InputJsonValue,
            degreeClassesJson: input.degreeClasses as unknown as Prisma.InputJsonValue,
            isDefault: Boolean(input.isDefault),
          },
        });
      });

      return toPublicScale(scale);
    },

    async updateScale(userId: string, scaleId: string, input: UpdateScaleInput) {
      const existing = await prisma.gradingScale.findFirst({ where: { id: scaleId, userId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Grading scale not found');

      const nextMaxGpa = input.maxGpa ?? existing.maxGpa;
      const nextBoundaries = input.boundaries ?? parseBoundaries(existing.boundariesJson);
      const nextDegreeClasses =
        input.degreeClasses ?? parseDegreeClasses(existing.degreeClassesJson);

      validateScaleNumbers(nextMaxGpa, nextBoundaries, nextDegreeClasses);

      const updated = await prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.gradingScale.updateMany({
            where: { userId, isDefault: true, id: { not: scaleId } },
            data: { isDefault: false },
          });
        }
        const saved = await tx.gradingScale.update({
          where: { id: scaleId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.maxGpa !== undefined ? { maxGpa: input.maxGpa } : {}),
            ...(input.retakePolicy !== undefined
              ? { retakePolicy: input.retakePolicy as RetakePolicy }
              : {}),
            ...(input.boundaries !== undefined
              ? { boundariesJson: input.boundaries as unknown as Prisma.InputJsonValue }
              : {}),
            ...(input.degreeClasses !== undefined
              ? { degreeClassesJson: input.degreeClasses as unknown as Prisma.InputJsonValue }
              : {}),
            ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          },
        });

        // Re-sync existing grade records tied to this scale (or unlinked when default) if boundaries changed
        if (input.boundaries !== undefined) {
          const affected = await tx.gradeRecord.findMany({
            where: saved.isDefault
              ? { userId, OR: [{ scaleId }, { scaleId: null }] }
              : { userId, scaleId },
          });
          for (const rec of affected) {
            const matched =
              rec.score !== null
                ? resolveBoundaryFromScore(nextBoundaries, rec.score)
                : resolveBoundaryFromLabel(nextBoundaries, rec.gradeLabel);
            if (matched) {
              await tx.gradeRecord.update({
                where: { id: rec.id },
                data: {
                  gradeLabel: matched.label,
                  gradePoint: matched.gradePoint,
                  excludeFromGpa: Boolean(matched.excludeFromGpa),
                },
              });
            }
          }
        }
        return saved;
      });

      return toPublicScale(updated);
    },

    async deleteScale(userId: string, scaleId: string) {
      const scales = await prisma.gradingScale.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      const target = scales.find((s) => s.id === scaleId);
      if (!target) throw new AppError('NOT_FOUND', 'Grading scale not found');
      if (scales.length <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Keep at least one grading scale');
      }

      await prisma.$transaction(async (tx) => {
        await tx.gradingScale.delete({ where: { id: scaleId } });
        if (target.isDefault) {
          const fallback = scales.find((s) => s.id !== scaleId);
          if (fallback) {
            await tx.gradingScale.update({
              where: { id: fallback.id },
              data: { isDefault: true },
            });
          }
        }
      });
    },

    async createRecord(userId: string, input: CreateGradeRecordInput) {
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const scale = await resolveScaleByIdOrDefault(userId, input.scaleId);
      const resolved = resolveGradeValues(scale, input);
      const retakeGroupKey = input.retakeGroupKey?.trim()
        ? normalizeCourseKey(input.retakeGroupKey)
        : input.isRetake
          ? normalizeCourseKey(input.courseCode) || null
          : null;

      const created = await prisma.gradeRecord.create({
        data: {
          userId,
          courseId: input.courseId ?? null,
          scaleId: scale.id,
          semester: input.semester,
          semesterOrder: input.semesterOrder,
          courseCode: input.courseCode.toUpperCase(),
          courseTitle: input.courseTitle,
          creditHours: input.creditHours,
          score: resolved.score,
          gradeLabel: resolved.gradeLabel,
          gradePoint: resolved.gradePoint,
          excludeFromGpa: resolved.excludeFromGpa,
          isRetake: Boolean(input.isRetake),
          retakeGroupKey,
        },
      });

      const bundle = await computeOverviewForUser(userId);
      return { record: created, ...bundle };
    },

    async updateRecord(userId: string, recordId: string, input: UpdateGradeRecordInput) {
      const existing = await prisma.gradeRecord.findFirst({ where: { id: recordId, userId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Grade record not found');

      if (input.courseId !== undefined) {
        await assertCourseOwnedIfPresent(userId, input.courseId);
      }

      const targetScaleId = input.scaleId !== undefined ? input.scaleId : existing.scaleId;
      const scale = await resolveScaleByIdOrDefault(userId, targetScaleId);

      const shouldReResolve =
        input.score !== undefined ||
        input.gradeLabel !== undefined ||
        input.gradePoint !== undefined ||
        input.excludeFromGpa !== undefined ||
        input.scaleId !== undefined;

      const resolved = shouldReResolve
        ? resolveGradeValues(scale, {
            score: input.score !== undefined ? input.score : existing.score,
            gradeLabel:
              input.gradeLabel !== undefined
                ? input.gradeLabel
                : input.score !== undefined
                  ? undefined
                  : existing.gradeLabel,
            gradePoint: input.gradePoint,
            excludeFromGpa: input.excludeFromGpa,
          })
        : {
            score: existing.score,
            gradeLabel: existing.gradeLabel,
            gradePoint: existing.gradePoint,
            excludeFromGpa: existing.excludeFromGpa,
          };

      const nextCourseCode =
        input.courseCode !== undefined ? input.courseCode.toUpperCase() : existing.courseCode;
      const nextIsRetake = input.isRetake !== undefined ? input.isRetake : existing.isRetake;
      const nextRetakeGroupKey =
        input.retakeGroupKey !== undefined
          ? input.retakeGroupKey
            ? normalizeCourseKey(input.retakeGroupKey)
            : null
          : nextIsRetake && !existing.retakeGroupKey
            ? normalizeCourseKey(nextCourseCode) || null
            : existing.retakeGroupKey;

      const updated = await prisma.gradeRecord.update({
        where: { id: recordId },
        data: {
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
          ...(input.scaleId !== undefined ? { scaleId: scale.id } : {}),
          ...(input.semester !== undefined ? { semester: input.semester } : {}),
          ...(input.semesterOrder !== undefined ? { semesterOrder: input.semesterOrder } : {}),
          ...(input.courseCode !== undefined ? { courseCode: nextCourseCode } : {}),
          ...(input.courseTitle !== undefined ? { courseTitle: input.courseTitle } : {}),
          ...(input.creditHours !== undefined ? { creditHours: input.creditHours } : {}),
          ...(input.isRetake !== undefined ? { isRetake: nextIsRetake } : {}),
          retakeGroupKey: nextRetakeGroupKey,
          score: resolved.score,
          gradeLabel: resolved.gradeLabel,
          gradePoint: resolved.gradePoint,
          excludeFromGpa: resolved.excludeFromGpa,
        },
      });

      const bundle = await computeOverviewForUser(userId);
      return { record: updated, ...bundle };
    },

    async deleteRecord(userId: string, recordId: string) {
      const existing = await prisma.gradeRecord.findFirst({ where: { id: recordId, userId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Grade record not found');
      await prisma.gradeRecord.delete({ where: { id: recordId } });
      return computeOverviewForUser(userId);
    },

    async whatIfPlan(userId: string, input: WhatIfPlanInput) {
      const { activeScale, overview } = await computeOverviewForUser(userId);
      if (input.targetClassLabel) {
        const matched = activeScale.degreeClasses.find(
          (c) => c.label.trim().toLowerCase() === input.targetClassLabel!.trim().toLowerCase(),
        );
        if (!matched) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Unknown degree class "${input.targetClassLabel}" for your active grading scale`,
          );
        }
      }
      return computeWhatIfPlan(overview, activeScale, input);
    },
  };
}

export type GpaService = ReturnType<typeof createGpaService>;
