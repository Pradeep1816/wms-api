import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LessonExplodeService } from './lesson-explode.service';
import { LessonStatusEnum } from '../../enums/lesson-status';

function createRepositoryMock() {
  return {
    findLessonWithRelations: vi.fn(),
    isPrivateLesson: vi.fn(),
    isExpired: vi.fn(),
    hasInvoice: vi.fn(),
    getEnrolment: vi.fn(),
    executeExplode: vi.fn(),
  };
}

describe('LessonExplodeService', () => {
  let service: LessonExplodeService;
  let explodeRepository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    explodeRepository = createRepositoryMock();
    service = new LessonExplodeService(explodeRepository as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('legacy-owned canExplode parity', () => {
    it('rejects missing lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue(null);

      const result = await service.canExplode(1001);

      expect(result).toEqual({
        canExplode: false,
        reason: 'Lesson not found',
        lessonId: 1001,
        checks: {
          isPrivate: false,
          isUnscheduled: false,
          notExploded: false,
          notExpired: false,
          notInvoiced: false,
        },
      });
    });

    it('rejects non-private lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.UNSCHEDULED,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(false);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);

      const result = await service.canExplode(1001);

      expect(result).toEqual({
        canExplode: false,
        reason: 'Only private lessons can be exploded',
        lessonId: 1001,
        checks: {
          isPrivate: false,
          isUnscheduled: true,
          notExploded: true,
          notExpired: true,
          notInvoiced: true,
        },
      });
    });

    it('rejects scheduled lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.SCHEDULED,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);

      const result = await service.canExplode(1001);

      expect(result.canExplode).toBe(false);
      expect(result.reason).toBe('Only unscheduled lessons can be exploded');
      expect(result.checks.isUnscheduled).toBe(false);
    });

    it('rejects already exploded lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 1,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);

      const result = await service.canExplode(1001);

      expect(result.canExplode).toBe(false);
      expect(result.reason).toBe('Lesson is already exploded');
      expect(result.checks.notExploded).toBe(false);
    });

    it('rejects expired unscheduled lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 0,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(true);
      explodeRepository.hasInvoice.mockResolvedValue(false);

      const result = await service.canExplode(1001);

      expect(result.canExplode).toBe(false);
      expect(result.reason).toBe('Lesson has expired');
      expect(result.checks.notExpired).toBe(false);
    });

    it('rejects invoiced lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 0,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(true);

      const result = await service.canExplode(1001);

      expect(result.canExplode).toBe(false);
      expect(result.reason).toBe('Invoiced lessons cannot be exploded');
      expect(result.checks.notInvoiced).toBe(false);
    });

    it('accepts fully eligible lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue({
        id: 1001,
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 0,
      });
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);

      const result = await service.canExplode(1001);

      expect(result).toEqual({
        canExplode: true,
        reason: undefined,
        lessonId: 1001,
        checks: {
          isPrivate: true,
          isUnscheduled: true,
          notExploded: true,
          notExpired: true,
          notInvoiced: true,
        },
      });
    });
  });

  describe('legacy-owned explode orchestration', () => {
    it('stops validateCanExplode on the first invalid lesson', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue(null);

      await expect(service.validateCanExplode([1001, 1002])).rejects.toThrow(
        new BadRequestException('Lesson 1001 cannot be exploded: Lesson not found'),
      );
    });

    it('maps executeExplode output into the response DTO', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        teacherId: 601,
        course: { locationId: 3 },
        date: new Date('2026-05-01T10:00:00.000Z'),
        duration: '01:00:00',
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 0,
        isPresent: true,
        programRate: 80,
      };
      const splitLessons = [
        {
          id: 2001,
          courseId: 77,
          teacherId: 601,
          date: new Date('2026-05-01T10:00:00.000Z'),
          duration: '00:15:00',
          status: LessonStatusEnum.UNSCHEDULED,
          isExploded: 1,
          programRate: '40.00',
        },
        {
          id: 2002,
          courseId: 77,
          teacherId: 601,
          date: new Date('2026-05-01T10:15:00.000Z'),
          duration: '00:15:00',
          status: LessonStatusEnum.UNSCHEDULED,
          isExploded: 1,
          programRate: '40.00',
        },
      ];

      explodeRepository.findLessonWithRelations.mockResolvedValue(lesson);
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);
      explodeRepository.getEnrolment.mockResolvedValue({ id: 201, studentId: 301 });
      explodeRepository.executeExplode.mockResolvedValue({
        explodedLessons: splitLessons,
        originalLessonId: 1001,
      });

      const results = await service.explodeLessons(3, { lessonIds: [1001] } as never, 501);

      expect(results).toEqual([
        {
          originalLessonId: 1001,
          explodedLessons: [
            {
              id: 2001,
              courseId: 77,
              teacherId: 601,
              date: splitLessons[0].date,
              duration: '00:15:00',
              status: LessonStatusEnum.UNSCHEDULED,
              isExploded: 1,
              programRate: 40,
            },
            {
              id: 2002,
              courseId: 77,
              teacherId: 601,
              date: splitLessons[1].date,
              duration: '00:15:00',
              status: LessonStatusEnum.UNSCHEDULED,
              isExploded: 1,
              programRate: 40,
            },
          ],
          totalSegments: 2,
          studentId: 301,
        },
      ]);
      expect(explodeRepository.executeExplode).toHaveBeenCalledWith(lesson, 201, 501);
    });

    it('rejects missing enrolment after location and eligibility checks pass', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        teacherId: 601,
        course: { locationId: 3 },
        date: new Date('2026-05-01T10:00:00.000Z'),
        duration: '01:00:00',
        status: LessonStatusEnum.UNSCHEDULED,
        isExploded: 0,
      };

      explodeRepository.findLessonWithRelations.mockResolvedValue(lesson);
      explodeRepository.isPrivateLesson.mockResolvedValue(true);
      explodeRepository.isExpired.mockResolvedValue(false);
      explodeRepository.hasInvoice.mockResolvedValue(false);
      explodeRepository.getEnrolment.mockResolvedValue(null);

      await expect(
        service.explodeLessons(3, { lessonIds: [1001] } as never, 501),
      ).rejects.toThrow(new BadRequestException('No enrolment found for lesson 1001'));
    });
  });

  describe('node-owned explode service guards', () => {
    it('rejects missing lesson during location validation', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValue(null);

      await expect(service.validateLessonsInLocation([1001], 3)).rejects.toThrow(
        new BadRequestException('Lesson 1001 not found'),
      );
    });

    it('rejects lessons outside the current location', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValueOnce({
        id: 1001,
        course: { locationId: 9 },
      } as never);

      await expect(service.validateLessonsInLocation([1001], 3)).rejects.toThrow(
        new ForbiddenException('Lesson 1001 does not belong to this location'),
      );
    });

    it('fires location guard before eligibility checks', async () => {
      explodeRepository.findLessonWithRelations.mockResolvedValueOnce({
        id: 1001,
        course: { locationId: 5 },
      } as never);

      await expect(
        service.explodeLessons(3, { lessonIds: [1001] } as never, 501),
      ).rejects.toThrow(new ForbiddenException('Lesson 1001 does not belong to this location'));
      expect(explodeRepository.isPrivateLesson).not.toHaveBeenCalled();
    });
  });
});
