import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonValidationService } from './lesson-validation.service';
import { ProgramTypeEnum } from '../../program/enums/program-type';

function createRepositoryMock() {
  return {
    findStudentEnrolmentByProgram: vi.fn(),
    checkLessonConflict: vi.fn(),
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
}

function createQueryBuilderMock(result: unknown) {
  return {
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(async () => result),
  };
}

describe('LessonValidationService', () => {
  let service: LessonValidationService;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let lessonEntityRepository: ReturnType<typeof createRepositoryMock>;
  let courseRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentRepository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    lessonRepository = createRepositoryMock();
    lessonEntityRepository = createRepositoryMock();
    courseRepository = createRepositoryMock();
    enrolmentRepository = createRepositoryMock();

    service = new LessonValidationService(
      lessonRepository as any,
      lessonEntityRepository as any,
      courseRepository as any,
      enrolmentRepository as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('legacy-owned private validation behavior', () => {
    it('passes private lesson validation when date, duration, and student availability are valid', async () => {
      lessonRepository.findStudentEnrolmentByProgram.mockResolvedValue({ id: 901 });
      lessonRepository.checkLessonConflict.mockResolvedValue(null);

      const result = await service.validatePrivateLesson(3, 401, {
        programId: 501,
        teacherId: 601,
        date: '2026-05-01 10:00:00',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: true,
        message: 'Validation passed',
      });
      expect(lessonRepository.findStudentEnrolmentByProgram).toHaveBeenCalledWith(401, 501);
      expect(lessonRepository.checkLessonConflict).toHaveBeenCalledWith(
        401,
        new Date('2026-05-01 10:00:00'),
        '00:45:00',
        3,
      );
    });

    it('rejects invalid private lesson date', async () => {
      lessonRepository.findStudentEnrolmentByProgram.mockResolvedValue({ id: 901 });

      const result = await service.validatePrivateLesson(3, 401, {
        programId: 501,
        teacherId: 601,
        date: 'bad-date',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          date: ['Invalid date format'],
        },
        message: 'Validation failed',
      });
    });

    it('rejects invalid private lesson duration', async () => {
      lessonRepository.findStudentEnrolmentByProgram.mockResolvedValue({ id: 901 });

      const result = await service.validatePrivateLesson(3, 401, {
        programId: 501,
        teacherId: 601,
        date: '2026-05-01 10:00:00',
        duration: '1:5',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          duration: ['Invalid duration format. Expected HH:mm:ss'],
        },
        message: 'Validation failed',
      });
    });

    it("rejects student overlap for private lesson validation", async () => {
      lessonRepository.findStudentEnrolmentByProgram.mockResolvedValue({ id: 901 });
      lessonRepository.checkLessonConflict.mockResolvedValue({ id: 1001 });

      const result = await service.validatePrivateLesson(3, 401, {
        programId: 501,
        teacherId: 601,
        date: '2026-05-01 10:00:00',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          date: ["Lesson time conflicts with student's another lesson"],
        },
        message: 'Validation failed',
      });
    });
  });

  describe('legacy-owned update validation behavior', () => {
    it('passes update validation when private lesson has no student or teacher conflicts', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue({
        studentId: 401,
        student: { id: 401 },
      });
      lessonRepository.checkLessonConflict.mockResolvedValue(null);
      const teacherConflictSpy = vi
        .spyOn(service as any, 'checkTeacherConflictForUpdate')
        .mockResolvedValue(null);

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: true,
        message: 'Validation passed',
      });
      expect(enrolmentRepository.findOne).toHaveBeenCalledWith({
        where: { courseId: 77 },
        relations: ['student'],
      });
      expect(lessonRepository.checkLessonConflict).toHaveBeenCalledWith(
        401,
        new Date('2026-05-01T10:00:00.000Z'),
        '00:45:00',
        3,
        1001,
      );
      expect(teacherConflictSpy).toHaveBeenCalledWith(
        601,
        new Date('2026-05-01T10:00:00.000Z'),
        '00:45:00',
        3,
        1001,
      );
    });

    it('maps missing lesson in location to validation failure payload', async () => {
      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(null));

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          _general: ['Lesson with ID 1001 not found or not in specified location'],
        },
        message: 'Validation failed',
      });
    });

    it('rejects missing student context for private lesson update', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue(null);

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          _general: ['Student not found for this lesson'],
        },
        message: 'Validation failed',
      });
    });

    it('rejects invalid update date', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue({
        studentId: 401,
        student: { id: 401 },
      });

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: 'invalid-date',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          date: ['Invalid date format'],
        },
        message: 'Validation failed',
      });
    });

    it('rejects invalid update duration', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue({
        studentId: 401,
        student: { id: 401 },
      });

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '0:45',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          duration: ['Invalid duration format. Expected HH:mm:ss'],
        },
        message: 'Validation failed',
      });
    });

    it('rejects student overlap before evaluating teacher overlap', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue({
        studentId: 401,
        student: { id: 401 },
      });
      lessonRepository.checkLessonConflict.mockResolvedValue({ id: 9001 });
      const teacherConflictSpy = vi
        .spyOn(service as any, 'checkTeacherConflictForUpdate')
        .mockResolvedValue(null);

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          date: ["Lesson time conflicts with student's another lesson"],
        },
        message: 'Validation failed',
      });
      expect(teacherConflictSpy).not.toHaveBeenCalled();
    });

    it('rejects teacher overlap for lesson update', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      enrolmentRepository.findOne.mockResolvedValue({
        studentId: 401,
        student: { id: 401 },
      });
      lessonRepository.checkLessonConflict.mockResolvedValue(null);
      vi.spyOn(service as any, 'checkTeacherConflictForUpdate').mockResolvedValue({ id: 2001 });

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          date: ["Lesson time conflicts with teacher's another lesson"],
        },
        message: 'Validation failed',
      });
    });

    it('skips student-enrolment lookup for group lesson update and still checks teacher overlap', async () => {
      const lesson = {
        id: 1001,
        courseId: 77,
        course: {
          program: { type: ProgramTypeEnum.GROUP_PROGRAM },
          locationId: 3,
        },
      };

      lessonEntityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(lesson));
      const teacherConflictSpy = vi
        .spyOn(service as any, 'checkTeacherConflictForUpdate')
        .mockResolvedValue(null);

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: true,
        message: 'Validation passed',
      });
      expect(enrolmentRepository.findOne).not.toHaveBeenCalled();
      expect(lessonRepository.checkLessonConflict).not.toHaveBeenCalled();
      expect(teacherConflictSpy).toHaveBeenCalledWith(
        601,
        new Date('2026-05-01T10:00:00.000Z'),
        '00:45:00',
        3,
        1001,
      );
    });
  });

  describe('node-owned error framing', () => {
    it('maps repository/runtime errors to a generic validation failure payload', async () => {
      lessonEntityRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn(async () => {
          throw new Error('db down');
        }),
      });

      const result = await service.validateLessonUpdate(3, 1001, {
        id: 1001,
        teacherId: 601,
        date: '2026-05-01T10:00:00.000Z',
        duration: '00:45:00',
      });

      expect(result).toEqual({
        success: false,
        errors: {
          _general: ['db down'],
        },
        message: 'Validation failed',
      });
    });
  });
});
