import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EnrolmentService } from './enrolment.service';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { EnrolmentDiscount } from '../entities/enrolment-discount.entity';
import { EnrolmentPaymentFrequency } from '../entities/enrolment-payment-frequency.entity';
import { Course } from '../../course/entities/course.entity';
import { Enrolment } from '../entities/enrolment.entity';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';

type StudentUpdatePayload = {
  updatedOn?: Date;
};

type UserUpdatePayload = {
  updated_at?: number;
};

function createQueryRunnerMock() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    manager: {
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createService(queryRunner?: ReturnType<typeof createQueryRunnerMock>) {
  const enrolmentEntityRepository = {
    findOne: vi.fn<[], Promise<unknown>>(),
  };
  const courseRepository = {
    findOne: vi.fn<[], Promise<unknown>>(),
  };
  const dataSource = {
    createQueryRunner: vi.fn(() => queryRunner),
  };

  const service = Object.create(EnrolmentService.prototype) as EnrolmentService;
  Object.assign(service, {
    enrolmentEntityRepository,
    courseRepository,
    dataSource,
  });

  return {
    service,
    enrolmentEntityRepository,
    courseRepository,
    dataSource,
  };
}

describe('EnrolmentService draft delete flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes an unconfirmed private enrolment into draft cleanup', async () => {
    const queryRunner = createQueryRunnerMock();
    const { service, enrolmentEntityRepository, courseRepository, dataSource } =
      createService(queryRunner);

    enrolmentEntityRepository.findOne.mockResolvedValue({
      id: 101,
      courseId: 201,
      studentId: 301,
      isConfirmed: 0,
      course: {
        id: 201,
        locationId: 11,
        isConfirmed: 0,
      },
      student: {
        id: 301,
        user: { id: 401 },
      },
    });
    courseRepository.findOne.mockResolvedValue({
      id: 201,
      locationId: 11,
      program: { type: 1 },
    });

    const result = await service.deleteEnrolment(11, 101, 'westside', 9001);

    expect(result).toEqual({
      status: true,
      url: '/admin/westside/enrolments',
      message: 'Draft enrolment has been cancelled.',
    });
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.manager.delete).toHaveBeenCalledWith(CourseSchedule, {
      courseId: 201,
    });
    expect(queryRunner.manager.delete).toHaveBeenCalledWith(CourseProgramRate, {
      courseId: 201,
    });
    expect(queryRunner.manager.delete).toHaveBeenCalledWith(EnrolmentDiscount, {
      enrolmentId: 101,
    });
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      EnrolmentPaymentFrequency,
      { enrolmentId: 101 },
      { isDeleted: true },
    );
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      Course,
      { id: 201 },
      { isDeleted: true, updatedByUserId: 9001 },
    );
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      Enrolment,
      { id: 101 },
      { isDeleted: true, updatedByUserId: 9001 },
    );
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      Student,
      { id: 301 },
      expect.objectContaining({
        status: 2,
        isDeleted: 1,
        updatedByUserId: 9001,
      }),
    );
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      User,
      { id: 401 },
      expect.objectContaining({
        status: User.STATUS_NOT_ACTIVE,
        isDeleted: true,
      }),
    );

    const studentUpdatePayloadRaw: unknown =
      queryRunner.manager.update.mock.calls[3]?.[2];
    const userUpdatePayloadRaw: unknown =
      queryRunner.manager.update.mock.calls[4]?.[2];
    const studentUpdatePayload =
      studentUpdatePayloadRaw as StudentUpdatePayload;
    const userUpdatePayload = userUpdatePayloadRaw as UserUpdatePayload;

    expect(studentUpdatePayload?.updatedOn).toBeInstanceOf(Date);
    expect(userUpdatePayload?.updated_at).toEqual(expect.any(Number));
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
