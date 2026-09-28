import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidateEditScheduleService } from './validate-edit-schedule.service';
import { ProgramTypeEnum } from '../../program/enums/program-type';

function createRepositoryMock() {
  return {
    findByIdAndLocationId: vi.fn(),
    isLessonInvoiced: vi.fn(),
  };
}

function createValidatorMock(methodName: string) {
  return {
    [methodName]: vi.fn(),
  };
}

describe('ValidateEditScheduleService', () => {
  let service: ValidateEditScheduleService;
  let repository: ReturnType<typeof createRepositoryMock>;
  let teacherOverlapValidator: { validateTeacherOverlap: ReturnType<typeof vi.fn> };
  let studentOverlapValidator: { validateStudentOverlap: ReturnType<typeof vi.fn> };
  let teacherEligibilityValidator: { validateTeacherEligibility: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = createRepositoryMock();
    teacherOverlapValidator = createValidatorMock(
      'validateTeacherOverlap',
    ) as unknown as typeof teacherOverlapValidator;
    studentOverlapValidator = createValidatorMock(
      'validateStudentOverlap',
    ) as unknown as typeof studentOverlapValidator;
    teacherEligibilityValidator = createValidatorMock(
      'validateTeacherEligibility',
    ) as unknown as typeof teacherEligibilityValidator;

    service = new ValidateEditScheduleService(
      repository as any,
      {} as any,
      teacherOverlapValidator as any,
      studentOverlapValidator as any,
      teacherEligibilityValidator as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no errors when date is empty, matching legacy skip-validation behavior', async () => {
    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '',
    });

    expect(result).toEqual({});
    expect(repository.findByIdAndLocationId).not.toHaveBeenCalled();
  });

  it('returns required errors when date is present but teacher and duration are missing', async () => {
    const result = await service.validateLessonOnUpdate(1001, 3, {
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({
      teacherId: ['Teacher Name cannot be blank.'],
      duration: ['Duration cannot be blank.'],
    });
  });

  it('returns date format error when edit date cannot be parsed', async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: 'bad-date',
    });

    expect(result).toEqual({
      date: ['Invalid lesson date format.'],
    });
  });

  it('returns no errors when lesson is not found in the location', async () => {
    repository.findByIdAndLocationId.mockResolvedValue(null);

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({});
    expect(repository.isLessonInvoiced).not.toHaveBeenCalled();
  });

  it("rejects invoiced lessons before overlap checks", async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(true);

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({
      date: ["Lesson can't be edited once its invoiced"],
    });
    expect(teacherOverlapValidator.validateTeacherOverlap).not.toHaveBeenCalled();
    expect(studentOverlapValidator.validateStudentOverlap).not.toHaveBeenCalled();
  });

  it('validates teacher eligibility when teacher changes', async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 777,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({});
    expect(teacherEligibilityValidator.validateTeacherEligibility).toHaveBeenCalledWith(
      777,
      1001,
      3,
    );
  });

  it('returns teacher eligibility error on teacher change failure', async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);
    teacherEligibilityValidator.validateTeacherEligibility.mockRejectedValue(
      new Error('Please choose an eligible teacher who is qualified to teach Private Piano!'),
    );

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 777,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({
      teacherId: ['Please choose an eligible teacher who is qualified to teach Private Piano!'],
    });
  });

  it('returns teacher overlap error using legacy wording shape', async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);
    teacherOverlapValidator.validateTeacherOverlap.mockRejectedValue(
      new Error('Teacher occupied with another lesson'),
    );

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({
      date: ['Teacher occupied with another lesson'],
    });
  });

  it("returns student overlap error for private lessons", async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);
    studentOverlapValidator.validateStudentOverlap.mockRejectedValue(
      new Error("Lesson time conflicts with student's another lesson"),
    );

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({
      date: ["Lesson time conflicts with student's another lesson"],
    });
  });

  it('skips student overlap checks for group lessons', async () => {
    repository.findByIdAndLocationId.mockResolvedValue({
      id: 1001,
      teacherId: 601,
      duration: '00:45:00',
      course: { program: { type: ProgramTypeEnum.GROUP_PROGRAM, name: 'Group Guitar' } },
    });
    repository.isLessonInvoiced.mockResolvedValue(false);

    const result = await service.validateLessonOnUpdate(1001, 3, {
      teacherId: 601,
      duration: '00:45:00',
      date: '2026-05-05 10:15 AM',
    });

    expect(result).toEqual({});
    expect(studentOverlapValidator.validateStudentOverlap).not.toHaveBeenCalled();
  });
});
