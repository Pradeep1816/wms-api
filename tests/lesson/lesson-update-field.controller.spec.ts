import { describe, expect, it, vi } from 'vitest';
import { LessonController } from '../../src/lesson/controllers/lesson.controller';
import { LessonStatusEnum } from '../../src/lesson/enums/lesson-status';

function buildControllerFixture() {
  const lessonService = {
    getLessonEntityById: vi.fn(),
    updateLesson: vi.fn(),
  };
  const lessonReviewService = {
    getLessonReview: vi.fn(),
  };

  const controller = new LessonController(
    lessonService as any,
    {} as any,
    lessonReviewService as any,
    {} as any,
    {} as any,
  );

  return {
    controller,
    lessonService,
    lessonReviewService,
  };
}

describe('LessonController.updateLessonField', () => {
  it('apply all updates only conflicted lessons from the review', async () => {
    const { controller, lessonService, lessonReviewService } = buildControllerFixture();

    lessonService.getLessonEntityById.mockResolvedValue({
      id: 3,
      courseId: 77,
    });

    lessonReviewService.getLessonReview.mockResolvedValue({
      lessons: [
        {
          id: 1,
          date: new Date('2026-07-02T16:30:00.000Z'),
          isConflict: false,
        },
        {
          id: 2,
          date: new Date('2026-08-06T16:30:00.000Z'),
          isConflict: false,
        },
        {
          id: 3,
          date: new Date('2026-09-01T16:30:00.000Z'),
          isConflict: true,
        },
        {
          id: 4,
          date: new Date('2026-09-08T16:30:00.000Z'),
          isConflict: true,
        },
      ],
    });

    lessonService.updateLesson.mockImplementation(async (lessonId: number, _locationId: number, data: any) => ({
      id: lessonId,
      ...data,
    }));

    const response = await controller.updateLessonField(
      1,
      '3',
      {
        date: '2026-09-03T16:00:00.000Z',
        duration: '00:30:00',
        teacherId: 602,
        applyContext: '2',
      } as any,
      {
        user: { id: 999 },
        query: {},
      },
    );

    expect(lessonReviewService.getLessonReview).toHaveBeenCalledWith(77, 1, true);
    expect(lessonService.updateLesson).toHaveBeenCalledTimes(2);
    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      3,
      1,
      expect.objectContaining({
        date: '2026-09-03T16:00:00.000Z',
        duration: '00:30:00',
        teacherId: 602,
      }),
      999,
    );
    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      4,
      1,
      expect.objectContaining({
        date: '2026-09-10T16:00:00.000Z',
        duration: '00:30:00',
        teacherId: 602,
      }),
      999,
    );
    expect(lessonService.updateLesson).not.toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(lessonService.updateLesson).not.toHaveBeenCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    expect(response).toEqual({
      success: true,
      data: {
        updatedCount: 2,
        totalCount: 2,
      },
      message: '2 of 2 lessons updated successfully',
    });
  });

  it('single update derives unscheduled status internally when no date is provided', async () => {
    const { controller, lessonService } = buildControllerFixture();

    lessonService.updateLesson.mockResolvedValue({
      id: 3,
      date: null,
      teacherId: 602,
      duration: '00:30:00',
    });

    const response = await controller.updateLessonField(
      1,
      '3',
      {
        teacherId: 602,
        duration: '00:30:00',
        applyContext: '1',
      } as any,
      {
        user: { id: 999 },
        query: {},
      },
    );

    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      3,
      1,
      expect.objectContaining({
        status: LessonStatusEnum.UNSCHEDULED,
        teacherId: 602,
        duration: '00:30:00',
      }),
      999,
    );

    expect(response).toEqual({
      success: true,
      data: {
        id: 3,
        date: null,
        teacherId: 602,
        duration: '00:30:00',
      },
      message: 'Lesson updated successfully',
    });
  });

  it('single apply updates only the selected lesson date and time', async () => {
    const { controller, lessonService, lessonReviewService } = buildControllerFixture();

    lessonService.updateLesson.mockResolvedValue({
      id: 3,
      date: new Date('2026-09-03T16:00:00.000Z'),
      teacherId: 602,
      duration: '00:30:00',
    });

    const response = await controller.updateLessonField(
      1,
      '3',
      {
        date: '2026-09-03T16:00:00.000Z',
        teacherId: 602,
        duration: '00:30:00',
        applyContext: '1',
      } as any,
      {
        user: { id: 999 },
        query: {},
      },
    );

    expect(lessonReviewService.getLessonReview).not.toHaveBeenCalled();
    expect(lessonService.updateLesson).toHaveBeenCalledTimes(1);
    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      3,
      1,
      expect.objectContaining({
        date: '2026-09-03T16:00:00.000Z',
        teacherId: 602,
        duration: '00:30:00',
      }),
      999,
    );

    expect(response).toEqual({
      success: true,
      data: {
        id: 3,
        date: new Date('2026-09-03T16:00:00.000Z'),
        teacherId: 602,
        duration: '00:30:00',
      },
      message: 'Lesson updated successfully',
    });
  });
});
