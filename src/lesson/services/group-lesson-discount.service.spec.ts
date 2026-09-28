import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { GroupLesson } from '../entities/group-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import type { GroupLessonDiscountRepository } from '../repositories/group-lesson-discount.repository';
import type { LessonConfirmationService } from './lesson-confirmation.service';
import { GroupLessonDiscountService } from './group-lesson-discount.service';

describe('GroupLessonDiscountService', () => {
  let groupLesson: GroupLesson;
  let paidAmount: number;
  let groupLessonRepository: { save: ReturnType<typeof vi.fn> };
  let lessonRepository: { update: ReturnType<typeof vi.fn> };
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let service: GroupLessonDiscountService;

  beforeEach(() => {
    groupLesson = Object.assign(new GroupLesson(), {
      id: 13289,
      lessonId: 5275131,
      enrolmentId: 33855,
      total: 143.75,
      balance: 143.75,
      paidStatus: GroupLesson.STATUS_OWING,
      isDeleted: false,
    });
    paidAmount = 0;
    groupLessonRepository = {
      save: vi.fn((value: GroupLesson) => Promise.resolve(value)),
    };
    lessonRepository = {
      update: vi.fn(),
    };
    const manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === GroupLesson) return groupLessonRepository;
        if (entity === Lesson) return lessonRepository;
        throw new Error('Unexpected repository');
      }),
    };
    const entityManager = {
      transaction: vi.fn((run: (value: typeof manager) => Promise<unknown>) =>
        run(manager),
      ),
    };
    repository = {
      findLessonInLocation: vi.fn().mockResolvedValue({
        id: 5275131,
        programRate: 143.75,
        tax: 0,
        course: { program: { type: ProgramTypeEnum.GROUP_PROGRAM } },
      }),
      enrolmentExistsForLessonCourse: vi.fn().mockResolvedValue(true),
      hasInvoiceForLessonEnrolment: vi.fn().mockResolvedValue(false),
      findGroupLessonByLessonAndEnrolment: vi
        .fn()
        .mockImplementation(() => Promise.resolve(groupLesson)),
      saveGroupDiscount: vi.fn(),
      getCreditAppliedAmount: vi
        .fn()
        .mockImplementation(() => Promise.resolve(paidAmount)),
      getCustomerIdByEnrolment: vi.fn().mockResolvedValue(null),
    };
    service = new GroupLessonDiscountService(
      entityManager as unknown as EntityManager,
      repository as unknown as GroupLessonDiscountRepository,
      {
        updateCustomerBalance: vi.fn(),
      } as unknown as LessonConfirmationService,
    );
  });

  it.each([
    [0, 139.44, GroupLesson.STATUS_OWING],
    [139.43, 0.01, GroupLesson.STATUS_OWING],
    [139.44, 0, GroupLesson.STATUS_PAID],
    [139.45, -0.01, GroupLesson.STATUS_CREDIT],
  ])(
    'normalizes a 3%% discounted total when paid=%s',
    async (paid, expectedBalance, expectedStatus) => {
      paidAmount = paid;

      await service.applyDiscount(15, 5275131, 33855, 3, 1, 694);

      expect(groupLesson.total).toBe(139.44);
      expect(groupLesson.balance).toBe(expectedBalance);
      expect(groupLesson.paidStatus).toBe(expectedStatus);
      expect(groupLessonRepository.save).toHaveBeenCalledWith(groupLesson);
    },
  );
});
