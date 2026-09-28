import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditTaxService } from './edit-tax.service';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Program } from '../../program/entities/program.entity';

function createLessonRepositoryMock() {
  return {
    findOne: vi.fn(),
    save: vi.fn(),
  };
}

function createPrivateLessonRepositoryMock() {
  return {
    save: vi.fn(),
  };
}

function createTransactionManagerMock(
  lessonRepository: ReturnType<typeof createLessonRepositoryMock>,
  privateLessonRepository: ReturnType<typeof createPrivateLessonRepositoryMock>,
) {
  return {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Lesson) {
        return lessonRepository;
      }

      if (entity === PrivateLesson) {
        return privateLessonRepository;
      }

      throw new Error(`Unexpected repository request: ${String(entity)}`);
    }),
  };
}

describe('EditTaxService', () => {
  let service: EditTaxService;
  let lessonRepository: ReturnType<typeof createLessonRepositoryMock>;
  let privateLessonRepository: ReturnType<typeof createPrivateLessonRepositoryMock>;
  let editTaxRepository: { getInvoicedLessonIds: ReturnType<typeof vi.fn> };
  let editDiscountRepository: {
    getLessonPaymentsForUnwind: ReturnType<typeof vi.fn>;
    softDeleteLessonPayment: ReturnType<typeof vi.fn>;
    updateLessonPaymentAmount: ReturnType<typeof vi.fn>;
    recalculatePaymentBalances: ReturnType<typeof vi.fn>;
  };
  let customerBalanceRecalculatorService: { recalculateAndPersist: ReturnType<typeof vi.fn> };
  let teacherEligibilityValidator: { validateTeacherEligibility: ReturnType<typeof vi.fn> };
  let transactionManager: ReturnType<typeof createTransactionManagerMock>;
  let entityManager: { transaction: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    lessonRepository = createLessonRepositoryMock();
    privateLessonRepository = createPrivateLessonRepositoryMock();
    editTaxRepository = {
      getInvoicedLessonIds: vi.fn().mockResolvedValue([]),
    };
    editDiscountRepository = {
      getLessonPaymentsForUnwind: vi.fn().mockResolvedValue([]),
      softDeleteLessonPayment: vi.fn().mockResolvedValue(undefined),
      updateLessonPaymentAmount: vi.fn().mockResolvedValue(undefined),
      recalculatePaymentBalances: vi.fn().mockResolvedValue(undefined),
    };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn().mockResolvedValue(undefined),
    };
    teacherEligibilityValidator = {
      validateTeacherEligibility: vi.fn().mockResolvedValue(undefined),
    };

    transactionManager = createTransactionManagerMock(
      lessonRepository,
      privateLessonRepository,
    );
    entityManager = {
      transaction: vi.fn(async (callback: (manager: any) => Promise<unknown>) =>
        callback(transactionManager),
      ),
      getRepository: vi.fn(() => lessonRepository),
    };

    service = new EditTaxService(
      entityManager as any,
      editTaxRepository as any,
      editDiscountRepository as any,
      customerBalanceRecalculatorService as any,
      teacherEligibilityValidator as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks tax edit when the current teacher is not eligible for the lesson program', async () => {
    const lesson = {
      id: 1001,
      teacherId: 601,
      isDeleted: false,
      tax: 0,
      course: {
        locationId: 3,
        program: { type: Program.TYPE_PRIVATE_PROGRAM, name: 'Flute' },
        enrolments: [],
      },
      discounts: [],
      privateLesson: [],
      getNetPrice: vi.fn(),
    };

    lessonRepository.findOne.mockResolvedValue(lesson);
    teacherEligibilityValidator.validateTeacherEligibility.mockRejectedValue(
      new BadRequestException(
        'Please choose an eligible teacher who is qualified to teach Flute!',
      ),
    );

    await expect(
      service.editTax({ id: 1001, tax: 7.25 }, 'training-location'),
    ).rejects.toThrow(
      'Please choose an eligible teacher who is qualified to teach Flute!',
    );

    expect(teacherEligibilityValidator.validateTeacherEligibility).toHaveBeenCalledWith(
      601,
      1001,
      3,
    );
    expect(lessonRepository.save).not.toHaveBeenCalled();
    expect(privateLessonRepository.save).not.toHaveBeenCalled();
    expect(customerBalanceRecalculatorService.recalculateAndPersist).not.toHaveBeenCalled();
  });

  it('updates tax after validating teacher eligibility', async () => {
    const privateLessonRow = { id: 301, total: 0, balance: 0 };
    const lesson = {
      id: 1001,
      teacherId: 601,
      isDeleted: false,
      tax: 0,
      course: {
        locationId: 3,
        program: { type: Program.TYPE_PRIVATE_PROGRAM, name: 'Flute' },
        enrolments: [
          {
            id: 201,
            isDeleted: false,
            student: {
              user: { id: 401 },
            },
          },
        ],
      },
      discounts: [],
      privateLesson: [privateLessonRow],
      getNetPrice: vi.fn(() => 123.45),
    };

    lessonRepository.findOne.mockResolvedValue(lesson);
    lessonRepository.save.mockImplementation(async (payload) => payload);
    editDiscountRepository.getLessonPaymentsForUnwind.mockResolvedValue([
      { id: 10, amount: 20, paymentId: 600 },
    ]);

    const result = await service.editTax(
      { id: 1001, tax: 7.256 },
      'training-location',
    );

    expect(teacherEligibilityValidator.validateTeacherEligibility).toHaveBeenCalledWith(
      601,
      1001,
      3,
    );
    expect(lessonRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tax: 7.26 }),
    );
    expect(privateLessonRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ total: 123.45, balance: 103.45 }),
    ]);
    expect(editDiscountRepository.getLessonPaymentsForUnwind).toHaveBeenCalledWith(
      1001,
      201,
      transactionManager,
    );
    expect(editDiscountRepository.softDeleteLessonPayment).not.toHaveBeenCalled();
    expect(editDiscountRepository.updateLessonPaymentAmount).not.toHaveBeenCalled();
    expect(editDiscountRepository.recalculatePaymentBalances).toHaveBeenCalledWith(
      [],
      transactionManager,
    );
    expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(
      401,
      { locationSlug: 'training-location' },
    );
    expect(result).toEqual({ tax: '$7.26' });
    expect(privateLessonRow.total).toBe(123.45);
    expect(privateLessonRow.balance).toBe(103.45);
  });

  it('unwinds overpaid lesson payments and stores a zero private-lesson balance', async () => {
    const privateLessonRow = { id: 301, total: 0, balance: 0 };
    const lesson = {
      id: 1002,
      teacherId: 601,
      isDeleted: false,
      tax: 0,
      course: {
        locationId: 3,
        program: { type: Program.TYPE_PRIVATE_PROGRAM, name: 'Flute' },
        enrolments: [
          {
            id: 202,
            isDeleted: false,
            student: {
              user: { id: 402 },
            },
          },
        ],
      },
      discounts: [],
      privateLesson: [privateLessonRow],
      getNetPrice: vi.fn(() => 10),
    };

    lessonRepository.findOne.mockResolvedValue(lesson);
    lessonRepository.save.mockImplementation(async (payload) => payload);
    editDiscountRepository.getLessonPaymentsForUnwind.mockResolvedValue([
      { id: 11, amount: 20, paymentId: 700 },
    ]);

    const result = await service.editTax(
      { id: 1002, tax: 0 },
      'training-location',
    );

    expect(editDiscountRepository.getLessonPaymentsForUnwind).toHaveBeenCalledWith(
      1002,
      202,
      transactionManager,
    );
    expect(editDiscountRepository.updateLessonPaymentAmount).toHaveBeenCalledWith(
      11,
      10,
      transactionManager,
    );
    expect(editDiscountRepository.softDeleteLessonPayment).not.toHaveBeenCalled();
    expect(editDiscountRepository.recalculatePaymentBalances).toHaveBeenCalledWith(
      [700],
      transactionManager,
    );
    expect(privateLessonRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ total: 10, balance: 0 }),
    ]);
    expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(
      402,
      { locationSlug: 'training-location' },
    );
    expect(result).toEqual({ tax: '$0.00' });
    expect(privateLessonRow.total).toBe(10);
    expect(privateLessonRow.balance).toBe(0);
  });
});
