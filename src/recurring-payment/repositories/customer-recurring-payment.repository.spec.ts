import { describe, expect, it, vi } from 'vitest';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { COMPLETED_ENROLMENT_LINK_WARNING } from '../dto/recurring-payment-enrolment-warning.dto';
import { CustomerRecurringPaymentRepository } from './customer-recurring-payment.repository';

function createQueryBuilderMock(rows: unknown[]) {
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethods = [
    'innerJoin',
    'leftJoin',
    'where',
    'andWhere',
    'select',
    'distinct',
    'groupBy',
    'orderBy',
    'addOrderBy',
  ];

  for (const method of chainMethods) {
    queryBuilder[method] = vi.fn(() => queryBuilder);
  }

  queryBuilder.getRawMany = vi.fn().mockResolvedValue(rows);
  queryBuilder.getCount = vi.fn().mockResolvedValue(rows.length);

  return queryBuilder;
}

describe('CustomerRecurringPaymentRepository.getEnrolmentLinkWarnings', () => {
  it('maps a completed linked enrolment and unlinked current enrolment to a warning', async () => {
    const queryBuilder = createQueryBuilderMock([
      {
        studentId: '12439',
        studentName: 'Akal Purewal',
        programName: 'Piano Core',
        completedEnrolmentId: '29336',
        currentEnrolmentId: '30968',
      },
    ]);
    const recurringPaymentRepository = {
      createQueryBuilder: vi.fn(() => queryBuilder),
    };

    const repository = new CustomerRecurringPaymentRepository(
      recurringPaymentRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const warnings = await repository.getEnrolmentLinkWarnings(3472, 7768, 15);

    expect(warnings).toEqual([
      {
        code: COMPLETED_ENROLMENT_LINK_WARNING,
        message:
          "Akal Purewal's completed Piano Core enrolment is still selected, while the current enrolment is not selected. Review this recurring payment before its next processing date.",
        studentId: 12439,
        studentName: 'Akal Purewal',
        programName: 'Piano Core',
        completedEnrolmentId: 29336,
        currentEnrolmentId: 30968,
      },
    ]);
    expect(recurringPaymentRepository.createQueryBuilder).toHaveBeenCalledWith(
      'recurringPayment',
    );
    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      Enrolment,
      'currentEnrolment',
      expect.stringContaining(
        'currentEnrolment.studentId = completedEnrolment.studentId',
      ),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'currentPaymentLink.id IS NULL',
    );
  });

  it('returns no warnings when no stale/current enrolment pair is found', async () => {
    const queryBuilder = createQueryBuilderMock([]);
    const repository = new CustomerRecurringPaymentRepository(
      { createQueryBuilder: vi.fn(() => queryBuilder) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      repository.getEnrolmentLinkWarnings(3472, 7768, 15),
    ).resolves.toEqual([]);
  });

  it('returns warning payment IDs for a list page in one batch query', async () => {
    const queryBuilder = createQueryBuilderMock([
      {
        recurringPaymentId: '3472',
        studentId: '12439',
        studentName: 'Akal Purewal',
        programName: 'Piano Core',
        completedEnrolmentId: '29336',
        currentEnrolmentId: '30968',
      },
    ]);
    const recurringPaymentRepository = {
      createQueryBuilder: vi.fn(() => queryBuilder),
    };
    const repository = new CustomerRecurringPaymentRepository(
      recurringPaymentRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const warningPaymentIds =
      await repository.getRecurringPaymentIdsWithEnrolmentLinkWarnings(
        [3472, 3472, 4000],
        15,
      );

    expect(warningPaymentIds).toEqual(new Set([3472]));
    expect(recurringPaymentRepository.createQueryBuilder).toHaveBeenCalledTimes(
      1,
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'recurringPayment.id IN (:...recurringPaymentIds)',
      { recurringPaymentIds: [3472, 4000] },
    );
  });
});

describe('CustomerRecurringPaymentRepository.getRecurringPaymentCreateEnrolments', () => {
  it('returns a net amount after the multiple-enrolment discount', async () => {
    const checkQueryBuilder = createQueryBuilderMock([{}]);
    const enrolmentQueryBuilder = createQueryBuilderMock([
      {
        id: '42',
        programName: 'Piano Core',
        paymentFrequency: 'Monthly',
        studentName: 'Sample Student',
        teacherName: 'Teacher',
        paymentFrequencyId: '1',
        grossDueAmount: '130.00',
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: '5.00',
        multipleEnrolmentDiscountType: '1',
        isSelected: '1',
      },
    ]);
    const enrolmentRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValueOnce(checkQueryBuilder)
        .mockReturnValueOnce(enrolmentQueryBuilder),
    };
    const repository = new CustomerRecurringPaymentRepository(
      {} as any,
      {} as any,
      {} as any,
      enrolmentRepository as any,
    );

    await expect(
      repository.getRecurringPaymentCreateEnrolments(100, 20, 200),
    ).resolves.toEqual([
      {
        id: '42',
        programName: 'Piano Core',
        paymentFrequency: 'Monthly',
        studentName: 'Sample Student',
        teacherName: 'Teacher',
        dueAmount: 125,
        isSelected: true,
      },
    ]);

    expect(enrolmentQueryBuilder.leftJoin).toHaveBeenCalledWith(
      'enrolment_discount',
      'multipleEnrolmentDiscount',
      expect.stringContaining('multipleEnrolmentDiscount.type = 2'),
    );
    expect(enrolmentQueryBuilder.leftJoin).toHaveBeenCalledWith(
      'course_program_rate',
      'courseProgramRate',
      expect.stringContaining("GREATEST('"),
    );
    expect(enrolmentQueryBuilder.leftJoin).toHaveBeenCalledWith(
      'course_program_rate',
      'courseProgramRate',
      expect.stringContaining('DATE(course.startDate)'),
    );
  });
});
