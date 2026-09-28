/**
 * Runs the real prepaid cycle pricing against the real database, inside a
 * transaction that is always rolled back.
 *
 * Unit tests mock the repositories, so they cannot catch schema drift, a wrong
 * column name, or a cascade that disagrees once real rows are involved. This
 * boots the actual Nest application, builds a real enrolment with real lessons
 * and payment cycles, prices it, reads the money back through the production
 * calculators, and then throws so nothing is kept.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register scripts/prepaid-integration-check.ts
 *
 * NOTE: `lesson_discount` is MyISAM and therefore NOT transactional. The
 * rollback undoes the lessons, enrolment, course and payment cycles, but any
 * prepaid discount rows written survive it. They are orphans - their lessons no
 * longer exist - and this clears them at the end. If the script dies partway,
 * clear them by hand:
 *
 *   DELETE ld FROM lesson_discount ld WHERE ld.type = 7
 *     AND NOT EXISTS (SELECT 1 FROM lesson l WHERE l.id = ld.lessonId);
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EnrolmentPrepaidPricingService } from '../src/pricing/services/enrolment-prepaid-pricing.service';
import { Lesson } from '../src/lesson/entities/lesson.entity';
import { LessonDiscount } from '../src/lesson/entities/lesson-discount.entity';
import { InvoiceLineItemDiscount } from '../src/invoice/entities/invoice-line-item-discount.entity';
import { InvoiceDiscountCalculator } from '../src/invoice/services/calculations/invoice-discount.calculator';
import { InvoiceItemsTransformationService } from '../src/invoice/services/transformations/invoice-items-transformation.service';
import { RecurringPaymentCreateCronRepository } from '../src/cron/repositories/recurring-payment-create-cron.repository';

const ROLLBACK = 'ROLLBACK-ON-PURPOSE';

/** Standard 60-minute tier 2: $350.00 a month, $1019.00 for three months. */
const PROGRAM_ID = 64;
const LOCATION_ID = 1;
const TIER = 2;
const HOURLY = 87.5;
const EXPECTED_TERM_TOTAL = 1019.0;
const EXPECTED_GROSS_EACH = 87.5;

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) < 0.005
      : actual === expected;
  console.log(
    `${ok ? '  PASS' : '  FAIL'}  ${label}: ${String(actual)}${ok ? '' : ` (expected ${String(expected)})`}`,
  );
  if (!ok) failures++;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);
  const prepaid = app.get(EnrolmentPrepaidPricingService);

  try {
    await dataSource.transaction(async (m) => {
      // A course whose lessons are priced from the catalogue, and an enrolment
      // on it billed quarterly at tier 2.
      const course = await m.query(
        `INSERT INTO course (locationId, programId, startDate, endDate, isConfirmed, isDeleted, type)
         VALUES (?, ?, '2026-09-01', '2026-12-31', 1, 0, 1)`,
        [LOCATION_ID, PROGRAM_ID],
      );
      const courseId = course.insertId;

      const student = await m.query(
        `SELECT id FROM student WHERE isDeleted = 0 ORDER BY id DESC LIMIT 1`,
      );
      const studentId = student[0].id;

      const enrolment = await m.query(
        `INSERT INTO enrolment (courseId, studentId, paymentFrequencyId, isConfirmed, isDeleted,
                                pricingTier, pricingTierIsDefaulted, keepsPreviousRate)
         VALUES (?, ?, 3, 1, 0, ?, 0, 0)`,
        [courseId, studentId, TIER],
      );
      const enrolmentId = enrolment.insertId;

      // Twelve weekly 60-minute lessons across the quarter, each at the tier
      // rate, plus the 3% payment-frequency row prepaid must suppress.
      const lessonIds: number[] = [];
      for (let i = 0; i < 12; i++) {
        const date = new Date(Date.UTC(2026, 8, 1 + i * 7, 16, 0, 0));
        const row = await m.query(
          `INSERT INTO lesson (courseId, date, duration, programRate, status, isConfirmed, isDeleted, tax)
           VALUES (?, ?, '01:00:00', ?, 2, 1, 0, 0)`,
          [courseId, date.toISOString().slice(0, 19).replace('T', ' '), HOURLY],
        );
        lessonIds.push(row.insertId);
        await m.query(
          `INSERT INTO lesson_discount (lessonId, enrolmentId, type, valueType, value)
           VALUES (?, ?, ?, 1, 3)`,
          [
            row.insertId,
            enrolmentId,
            LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
          ],
        );
      }

      const cycle = await m.query(
        `INSERT INTO payment_cycle (enrolmentId, startDate, endDate, isDeleted, isPreferredPaymentEnabled)
         VALUES (?, '2026-09-01', '2026-11-30', 0, 0)`,
        [enrolmentId],
      );
      for (const lessonId of lessonIds) {
        await m.query(
          `INSERT INTO payment_cycle_lesson (paymentCycleId, lessonId, isDeleted) VALUES (?, ?, 0)`,
          [cycle.insertId, lessonId],
        );
      }

      console.log(
        `\nEnrolment ${enrolmentId}, 12 lessons, quarterly, tier ${TIER}`,
      );
      console.log('--- applying prepaid ---');

      const outcome = await prepaid.applyForEnrolment({ enrolmentId }, m);
      check('cycles priced', outcome.cyclesPriced, 1);
      check('skip reason', outcome.skipped, null);

      // 1. The stored reduction sums to exactly the published total.
      const rows = await m.getRepository(LessonDiscount).find({
        where: { enrolmentId, type: LessonDiscount.TYPE_PREPAID_CYCLE },
      });
      const grossTotal = EXPECTED_GROSS_EACH * 12;
      const discountTotal = rows.reduce((sum, r) => sum + Number(r.value), 0);
      check('prepaid rows written', rows.length, 12);
      check(
        'gross - discount = published total',
        grossTotal - discountTotal,
        EXPECTED_TERM_TOTAL,
      );

      // 2. The production calculators agree, reading real rows.
      const lessons = await m.getRepository(Lesson).find({
        where: { courseId },
        relations: ['discounts'],
        order: { date: 'ASC' },
      });
      const entityTotal = lessons.reduce((sum, l) => sum + l.getSubTotal(), 0);
      check(
        'Lesson.getSubTotal() across the cycle',
        entityTotal,
        EXPECTED_TERM_TOTAL,
      );

      // 3. The 3% is suppressed, not stacked. 3% of $87.50 is $2.625 a lesson;
      //    if it were stacking the total would be about $31.50 lower.
      const first = lessons[0];
      check('first lesson gross', first.getGrossPrice(), EXPECTED_GROSS_EACH);
      // $1019.00 across 12 lessons is $84.91 each with 8 cents left over, which
      // lands on the last lesson. So the first is 87.50 - 84.91 = 2.59, and NOT
      // the $2.625 that 3% of $87.50 would give - the number this must not be.
      check(
        'first lesson discount is the dollar figure',
        first.getDiscount(),
        2.59,
      );
      check(
        'last lesson absorbs the remainder',
        lessons[11].getDiscount(),
        2.51,
      );

      // 4. The invoice cascade. Two separate implementations - one computes,
      //    one displays - and they must agree with each other and with the
      //    lesson. A line item carrying the prepaid dollar row and the 3%.
      const lineItem = {
        id: 1,
        unitPrice: EXPECTED_GROSS_EACH,
        unit: 1,
        isDeleted: false,
        discounts: [
          {
            type: InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE,
            value: 2.59,
            valueType: 0,
            isDeleted: false,
          },
          {
            type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
            value: 3,
            valueType: 1,
            isDeleted: false,
          },
        ],
      };
      const calculator = app.get(InvoiceDiscountCalculator);
      check(
        'invoice calculator uses the dollar figure',
        calculator.calculateLineItemDiscount(
          lineItem as never,
          { isEquipmentRentalContract: false } as never,
        ),
        2.59,
      );

      const transformer = app.get(InvoiceItemsTransformationService);
      const displayed = (
        transformer as never as {
          calculateDiscount: (
            gross: number,
            d: unknown[],
            rental: boolean,
          ) => number;
        }
      ).calculateDiscount(EXPECTED_GROSS_EACH, lineItem.discounts, false);
      check('invoice display agrees with the calculator', displayed, 2.59);

      // 5. The recurring-payment cron, which OVERWRITES private_lesson.total.
      const cronRepository = app.get(RecurringPaymentCreateCronRepository);
      const cronTotal = (
        cronRepository as never as {
          calculatePrivateLessonNetPrice: (
            row: unknown,
            d: unknown[],
          ) => number;
        }
      ).calculatePrivateLessonNetPrice(
        { programRate: HOURLY, duration: '01:00:00', tax: 0 },
        [
          {
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            value: 2.59,
            valueType: 0,
          },
          {
            type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
            value: 3,
            valueType: 1,
          },
        ],
      );
      check(
        'recurring-payment cron keeps the published figure',
        cronTotal,
        EXPECTED_GROSS_EACH - 2.59,
      );

      // 6. Re-running corrects rather than doubles.
      await prepaid.applyForEnrolment({ enrolmentId }, m);
      const afterRerun = await m.getRepository(LessonDiscount).find({
        where: { enrolmentId, type: LessonDiscount.TYPE_PREPAID_CYCLE },
      });
      check('re-run does not double the rows', afterRerun.length, 12);
      check(
        're-run does not double the money',
        grossTotal - afterRerun.reduce((s, r) => s + Number(r.value), 0),
        EXPECTED_TERM_TOTAL,
      );

      // 7. Losing the entitlement clears the rows.
      await m.query(`UPDATE enrolment SET keepsPreviousRate = 1 WHERE id = ?`, [
        enrolmentId,
      ]);
      await prepaid.applyForEnrolment({ enrolmentId }, m);
      const afterClear = await m.getRepository(LessonDiscount).find({
        where: { enrolmentId, type: LessonDiscount.TYPE_PREPAID_CYCLE },
      });
      check('grandfathering clears the prepaid rows', afterClear.length, 0);

      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) {
      console.error('\nUNEXPECTED ERROR:', error);
      failures++;
    } else {
      console.log('\n  (transaction rolled back - nothing written)');
    }
  }

  await app.close();
  console.log(
    failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
