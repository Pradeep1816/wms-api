import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LessonUnscheduleService } from './lesson-unschedule.service';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { Program } from '../../../program/entities/program.entity';

function createRepositoryMock() {
  return {
    findReasonsToUnschedule: vi.fn(),
    getLessonsWithCourse: vi.fn(),
    lessonInvoiced: vi.fn(),
    createAndSaveNote: vi.fn(),
    saveLesson: vi.fn(),
  };
}

describe('LessonUnscheduleService', () => {
  let service: LessonUnscheduleService;
  let unscheduleRepository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    unscheduleRepository = createRepositoryMock();
    service = new LessonUnscheduleService(unscheduleRepository as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('legacy-owned unschedule behavior', () => {
    it('returns reasons with the legacy modal title', async () => {
      unscheduleRepository.findReasonsToUnschedule.mockResolvedValue([
        { id: 1, reason: 'Student requested' },
        { id: 2, reason: 'Weather' },
      ]);

      const result = await service.getReasonsToUnschedule();

      expect(result).toEqual({
        title: 'Reason To Unschedule',
        reasons: [
          { id: 1, reason: 'Student requested' },
          { id: 2, reason: 'Weather' },
        ],
      });
    });

    it('unschedules safe private lessons by writing a note and resetting status/presence', async () => {
      const lessons = [
        {
          id: 2001,
          courseId: 77,
          course: { locationId: 3, program: { type: Program.TYPE_PRIVATE_PROGRAM } },
          status: LessonStatusEnum.SCHEDULED,
          isPresent: false,
        },
      ];

      unscheduleRepository.getLessonsWithCourse.mockResolvedValue(lessons);
      unscheduleRepository.lessonInvoiced.mockResolvedValue(false);
      unscheduleRepository.createAndSaveNote.mockResolvedValue({ id: 901 } as never);
      unscheduleRepository.saveLesson.mockImplementation(async (payload: any) => payload);

      const result = await service.unscheduleLessons(
        3,
        { lessonIds: [2001], reason: 'Travel' },
        501,
      );

      expect(result).toEqual({
        status: true,
        message: 'Lessons unscheduled successfully',
      });
      expect(lessons[0].status).toBe(LessonStatusEnum.UNSCHEDULED);
      expect(lessons[0].isPresent).toBe(true);
      expect(unscheduleRepository.createAndSaveNote).toHaveBeenCalledWith('Travel', 2001, 501);
      expect(unscheduleRepository.saveLesson).toHaveBeenCalledWith(lessons[0]);
    });

    it("rejects invoiced lessons with the legacy business rule", async () => {
      const lessons = [
        {
          id: 2001,
          courseId: 77,
          course: { locationId: 3, program: { type: Program.TYPE_PRIVATE_PROGRAM } },
        },
      ];

      unscheduleRepository.getLessonsWithCourse.mockResolvedValue(lessons as never);
      unscheduleRepository.lessonInvoiced.mockResolvedValue(true);

      await expect(
        service.unscheduleLessons(3, { lessonIds: [2001], reason: 'Travel' }, 501),
      ).rejects.toThrow(
        new BadRequestException(
          "One of the selected lessons is invoiced. Invoiced lessons can't be edited.",
        ),
      );
    });
  });

  describe('node-owned service guards', () => {
    it('rejects lesson count mismatch as not found', async () => {
      unscheduleRepository.getLessonsWithCourse.mockResolvedValue([{ id: 2001 }] as never);

      await expect(
        service.unscheduleLessons(3, { lessonIds: [2001, 2002], reason: 'Travel' }, 501),
      ).rejects.toThrow(new BadRequestException('One or more lessons not found.'));
    });

    it('rejects lessons outside the current location', async () => {
      const lessons = [
        {
          id: 2001,
          courseId: 77,
          course: { locationId: 9, program: { type: Program.TYPE_PRIVATE_PROGRAM } },
        },
      ];

      unscheduleRepository.getLessonsWithCourse.mockResolvedValue(lessons as never);

      await expect(
        service.unscheduleLessons(3, { lessonIds: [2001], reason: 'Travel' }, 501),
      ).rejects.toThrow(
        new BadRequestException('One or more lessons do not belong to this location.'),
      );
    });

    it('rejects unsupported program types', async () => {
      const lessons = [
        {
          id: 2001,
          courseId: 77,
          course: { locationId: 3, program: { type: 99 } },
        },
      ];

      unscheduleRepository.getLessonsWithCourse.mockResolvedValue(lessons as never);

      await expect(
        service.unscheduleLessons(3, { lessonIds: [2001], reason: 'Travel' }, 501),
      ).rejects.toThrow(
        new BadRequestException('Only private and group lessons can be unscheduled.'),
      );
    });
  });
});
