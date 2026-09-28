import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CourseLessonApplyAllService } from './course-lesson-apply-all.service';
import { ProgramTypeEnum } from '../../program/enums/program-type';

describe('CourseLessonApplyAllService', () => {
  let service: CourseLessonApplyAllService;
  let lessonService: {
    getLessonEntityById: ReturnType<typeof vi.fn>;
    getUnconfirmedLessonsByCourse: ReturnType<typeof vi.fn>;
    updateLesson: ReturnType<typeof vi.fn>;
  };
  let courseLessonReviewService: {
    getLessonReview: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    lessonService = {
      getLessonEntityById: vi.fn(),
      getUnconfirmedLessonsByCourse: vi.fn(),
      updateLesson: vi.fn(),
    };
    courseLessonReviewService = { getLessonReview: vi.fn() };
    service = new CourseLessonApplyAllService(
      lessonService as any,
      courseLessonReviewService as any,
    );
  });

  it('updates only conflicted draft lessons and returns the update counts', async () => {
    lessonService.getLessonEntityById.mockResolvedValue({
      courseId: 91,
      course: { program: { type: ProgramTypeEnum.GROUP_PROGRAM } },
    });
    courseLessonReviewService.getLessonReview.mockResolvedValue({
      lessons: [
        { id: 201, isConflict: true },
        { id: 202, isConflict: false },
        { id: 203, isConflict: true },
      ],
    });
    lessonService.getUnconfirmedLessonsByCourse.mockResolvedValue([
      { id: 201, date: '2026-10-25T18:30:00.000Z' },
      { id: 202, date: '2026-10-26T18:30:00.000Z' },
      { id: 203, date: '2026-10-27T18:30:00.000Z' },
      { id: 204, date: '2026-10-28T18:30:00.000Z' },
    ]);
    lessonService.updateLesson.mockResolvedValue(true);

    const result = await service.applyAllGroupCourseLessons(
      201,
      7,
      { goToDate: 'Nov 01, 2026', hour: '12', minute: '00', teacherId: 55, duration: '00:30:00' },
      88,
    );

    expect(result).toEqual({ updatedCount: 2, totalCount: 2 });
    expect(courseLessonReviewService.getLessonReview).toHaveBeenCalledWith(91, 7, true);
    expect(lessonService.updateLesson).toHaveBeenCalledTimes(2);
    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      201,
      7,
      { date: '2026-10-25T12:00:00.000Z', teacherId: 55, duration: '00:30:00' },
      88,
    );
    expect(lessonService.updateLesson).toHaveBeenCalledWith(
      203,
      7,
      { date: '2026-11-01T12:00:00.000Z', teacherId: 55, duration: '00:30:00' },
      88,
    );
  });

  it('returns zero counts and does not update lessons when there are no conflicts', async () => {
    lessonService.getLessonEntityById.mockResolvedValue({
      courseId: 91,
      course: { program: { type: ProgramTypeEnum.GROUP_PROGRAM } },
    });
    courseLessonReviewService.getLessonReview.mockResolvedValue({ lessons: [] });
    lessonService.getUnconfirmedLessonsByCourse.mockResolvedValue([
      { id: 201, date: '2026-10-25T18:30:00.000Z' },
    ]);

    const result = await service.applyAllGroupCourseLessons(
      201,
      7,
      { goToDate: 'Nov 01, 2026' },
      88,
    );

    expect(result).toEqual({ updatedCount: 0, totalCount: 0 });
    expect(lessonService.updateLesson).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the source lesson has no course', async () => {
    lessonService.getLessonEntityById.mockResolvedValue(null);

    await expect(
      service.applyAllGroupCourseLessons(201, 7, { goToDate: 'Nov 01, 2026' }, 88),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects lessons outside Group Courses', async () => {
    lessonService.getLessonEntityById.mockResolvedValue({
      courseId: 91,
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM } },
    });

    await expect(
      service.applyAllGroupCourseLessons(201, 7, { goToDate: 'Nov 01, 2026' }, 88),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(courseLessonReviewService.getLessonReview).not.toHaveBeenCalled();
  });

  it('rejects an invalid target date', async () => {
    lessonService.getLessonEntityById.mockResolvedValue({
      courseId: 91,
      course: { program: { type: ProgramTypeEnum.GROUP_PROGRAM } },
    });

    await expect(
      service.applyAllGroupCourseLessons(201, 7, { goToDate: 'not a date' }, 88),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(courseLessonReviewService.getLessonReview).not.toHaveBeenCalled();
  });
});
