import { PrivateLessonInvoiceService } from '../../lesson/services/generate-invoice.service';
import { InvoiceAllCompletedLessonsCronService } from './invoice-all-completed-lessons-cron.service';
import { InvoiceAllExpiredLessonsCronService } from './invoice-all-expired-lessons-cron.service';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

describe('prepaid invoice totals through scheduled jobs', () => {
  it.each([
    ['completed', false, 33.35],
    ['expired', false, 33.35],
    ['completed', true, 16.68],
    ['expired', true, 16.68],
  ] as const)(
    '%s job preserves prepaid pricing (exploded=%s)',
    async (job, exploded, expected) => {
      const location = { id: 15, name: 'QA', slug: 'qa' };
      const lesson = Object.assign(new Lesson(), {
        id: 100,
        programRate: exploded ? 72.52 : 72.5,
        duration: exploded ? '00:15:00' : '00:30:00',
        isExploded: exploded ? 1 : 0,
        isDeleted: false,
        isConfirmed: true,
        isPresent: true,
        tax: 0,
        date: new Date('2026-01-01T10:00:00Z'),
        status:
          job === 'expired'
            ? LessonStatusEnum.UNSCHEDULED
            : LessonStatusEnum.SCHEDULED,
        privateLesson: [
          { total: expected, expiryDate: new Date('2026-01-02T00:00:00Z') },
        ],
        discounts: [
          { type: 7, value: exploded ? 1.45 : 2.9, valueType: 0 },
          { type: 2, value: 8, valueType: 1 },
        ],
        course: {
          locationId: 15,
          program: { name: 'Bass Guitar' },
          enrolments: [
            {
              id: 10,
              student: {
                firstName: 'QA',
                lastName: 'Student',
                user: { id: 20, userLocation: { locationId: 15 } },
              },
            },
          ],
        },
        teacher: { profile: { firstname: 'QA', lastname: 'Teacher' } },
      });
      const manager = { transaction: vi.fn(async (run) => run(manager)) };
      const repo = {
        findLessonsForInvoice: vi.fn().mockResolvedValue([lesson]),
        findOneByLessonId: vi.fn().mockResolvedValue(null),
        getNextInvoiceNumber: vi.fn().mockResolvedValue(1),
        createInvoice: vi
          .fn()
          .mockResolvedValue({ id: 200, userId: 20, invoiceNumber: 1 }),
        findLessonItem: vi.fn().mockResolvedValue({ id: 1, taxStatusId: 1 }),
        getTaxDataForItem: vi
          .fn()
          .mockResolvedValue({
            taxTypeName: 'No Tax',
            taxCodeRate: 0,
            taxCodeCode: 'ON',
            taxStatusName: 'No Tax',
          }),
        createInvoiceLineItem: vi.fn().mockResolvedValue({ id: 300 }),
        createInvoiceItemLesson: vi.fn(),
        createLineItemDiscounts: vi.fn(),
        updateLineItemTotals: vi.fn(),
        updateInvoiceTotals: vi.fn(),
        saveCreditTransfer: vi.fn(),
      };
      const pricing = new PrivateLessonInvoiceService(
        manager as any,
        repo as any,
        { getLessonNetCreditAmount: vi.fn().mockResolvedValue(0) } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      vi.spyOn(pricing as any, 'createLegacyInvoiceLogs').mockResolvedValue(
        undefined,
      );
      const selections = {
        getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
        getCompletedGroupLessonIds: vi.fn().mockResolvedValue([]),
        getCompletedUninvoicedPrivateLessons: vi
          .fn()
          .mockResolvedValue([lesson]),
        getExpiredPrivateLessonIds: vi.fn().mockResolvedValue([100]),
      };
      const lock = {
        runWithLock: vi.fn((_lock, _name, _logger, run) => run()),
      };
      const cron =
        job === 'completed'
          ? new InvoiceAllCompletedLessonsCronService(
              selections as any,
              pricing,
              {} as any,
              lock as any,
            )
          : new InvoiceAllExpiredLessonsCronService(
              selections as any,
              pricing,
              lock as any,
            );
      const result = await cron.runManually(10);
      expect(result).toBeTruthy();
      expect(repo.updateLineItemTotals).toHaveBeenCalledWith(
        300,
        expected,
        0,
        manager,
      );
      expect(repo.updateInvoiceTotals).toHaveBeenCalledWith(
        200,
        expected,
        0,
        expected,
        expected,
        manager,
      );
      expect(repo.createLineItemDiscounts).toHaveBeenCalledWith(
        [expect.objectContaining({ type: 7, value: exploded ? 1.45 : 2.9 })],
        manager,
      );
    },
  );
});
