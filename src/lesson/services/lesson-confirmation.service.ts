import { ensurePrivateLessonEmailStatuses } from '../helpers/ensure-lesson-email-statuses';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, Not } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { LessonHierarchy } from '../entities/lesson-hierarchy.entity';
import { Program } from '../../program/entities/program.entity';
import { PrivateLessonEmailStatus } from '../entities/private-lesson-email-status.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { EnrolmentDiscount } from '../../enrolment/entities/enrolment-discount.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { EnrolmentPaymentFrequency } from '../../enrolment/entities/enrolment-payment-frequency.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { BulkRescheduleLesson } from '../entities/bulk-reschedule-lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { PaymentCycleLesson } from '../../enrolment/entities/payment-cycle-lesson.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { calculatePaymentCycleDueDate } from '../../payment/utils/payment-cycle-due-date.util';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { EnrolmentPrepaidPricingService } from '../../pricing/services/enrolment-prepaid-pricing.service';
import { getWeekdaysList } from '../../utils/date-utils';
import { formatTime } from '../../utils/formatters';
import { RoundingUtils } from '../../utils/rounding.utils';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { AuditLogWriterService } from '../../log/services/audit-log-writer.service';
import { getDisplayName } from '../../shared/helpers/display-name.helper';

@Injectable()
export class LessonConfirmationService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(PrivateLessonEmailStatus)
    private readonly privateLessonEmailStatusRepository: Repository<PrivateLessonEmailStatus>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(CustomerDiscount)
    private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    @InjectRepository(EnrolmentDiscount)
    private readonly enrolmentDiscountRepository: Repository<EnrolmentDiscount>,
    @InjectRepository(PaymentCycle)
    private readonly paymentCycleRepository: Repository<PaymentCycle>,
    @InjectRepository(EnrolmentPaymentFrequency)
    private readonly enrolmentPaymentFrequencyRepository: Repository<EnrolmentPaymentFrequency>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(BulkRescheduleLesson)
    private readonly bulkRescheduleLessonRepository: Repository<BulkRescheduleLesson>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(PaymentCycleLesson)
    private readonly paymentCycleLessonRepository: Repository<PaymentCycleLesson>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly auditLogWriterService?: AuditLogWriterService,
    /**
     * Optional for the same reason as the audit writer above: the spec builds
     * this service with `new` and positional arguments, so a required
     * twenty-third parameter would break every test that does not care about
     * prepaid. Nest supplies it in production, and the one call site checks.
     */
    private readonly enrolmentPrepaidPricing?: EnrolmentPrepaidPricingService,
  ) {}

  private getScopedRepositories(manager?: EntityManager) {
    return {
      courseRepository: manager
        ? manager.getRepository(Course)
        : this.courseRepository,
      lessonRepository: manager
        ? manager.getRepository(Lesson)
        : this.lessonRepository,
      privateLessonRepository: manager
        ? manager.getRepository(PrivateLesson)
        : this.privateLessonRepository,
      lessonHierarchyRepository: manager
        ? manager.getRepository(LessonHierarchy)
        : this.lessonHierarchyRepository,
      privateLessonEmailStatusRepository: manager
        ? manager.getRepository(PrivateLessonEmailStatus)
        : this.privateLessonEmailStatusRepository,
      lessonDiscountRepository: manager
        ? manager.getRepository(LessonDiscount)
        : this.lessonDiscountRepository,
      customerDiscountRepository: manager
        ? manager.getRepository(CustomerDiscount)
        : this.customerDiscountRepository,
      enrolmentDiscountRepository: manager
        ? manager.getRepository(EnrolmentDiscount)
        : this.enrolmentDiscountRepository,
      paymentCycleRepository: manager
        ? manager.getRepository(PaymentCycle)
        : this.paymentCycleRepository,
      enrolmentPaymentFrequencyRepository: manager
        ? manager.getRepository(EnrolmentPaymentFrequency)
        : this.enrolmentPaymentFrequencyRepository,
      enrolmentRepository: manager
        ? manager.getRepository(Enrolment)
        : this.enrolmentRepository,
      bulkRescheduleLessonRepository: manager
        ? manager.getRepository(BulkRescheduleLesson)
        : this.bulkRescheduleLessonRepository,
      courseScheduleRepository: manager
        ? manager.getRepository(CourseSchedule)
        : this.courseScheduleRepository,
      paymentCycleLessonRepository: manager
        ? manager.getRepository(PaymentCycleLesson)
        : this.paymentCycleLessonRepository,
      qualificationRepository: manager
        ? manager.getRepository(Qualification)
        : this.qualificationRepository,
      lessonPaymentRepository: manager
        ? manager.getRepository(LessonPayment)
        : this.lessonPaymentRepository,
    };
  }

  /**
   * Confirm lessons created for a new enrolment. Permanent schedule changes
   * use PermanentScheduleChangeConfirmationService instead.
   */
  async confirmLessonsForCourse(
    courseId: number,
    locationId: number,
    userId?: number,
    locationSlug?: string,
  ): Promise<number | null> {
    try {
      const course = await this.courseRepository.findOne({
        where: { id: courseId, locationId, isDeleted: false },
        relations: [
          'program',
          'enrolments',
          'enrolments.student',
          'enrolments.student.user',
        ],
      });

      if (!course) {
        throw new NotFoundException(`Course with ID ${courseId} not found`);
      }

      const lessonsToConfirm = await this.lessonRepository.find({
        where: {
          courseId,
          isConfirmed: false,
          isDeleted: false,
        },
        order: {
          date: 'ASC',
        },
      });

      return await this.confirmLessonsForCourseWithScope({
          course,
          userId,
          lessonsToConfirm,
          locationSlug,
        });
    } catch (error) {
      console.error('Error in confirmLessonsForCourse service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to confirm lessons: ${error.message}`,
      );
    }
  }

  private async confirmLessonsForCourseWithScope({
    course,
    userId,
    lessonsToConfirm,
    locationSlug,
  }: {
    course: Course;
    userId?: number;
    lessonsToConfirm: Lesson[];
    locationSlug?: string;
  }): Promise<number | null> {
    const {
      courseRepository,
      lessonRepository,
      privateLessonRepository,
      lessonHierarchyRepository,
      privateLessonEmailStatusRepository,
      lessonDiscountRepository,
      customerDiscountRepository,
      enrolmentDiscountRepository,
      paymentCycleRepository,
      enrolmentRepository,
      enrolmentPaymentFrequencyRepository,
    } = this.getScopedRepositories();

    // Check if program is private (matching legacy: $lesson->isPrivate())
    const isPrivateProgram =
      course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

    // Variable to store enrolment ID for response
    let enrolmentId: number | null = null;

      // Set course.isConfirmed = 1 (matching legacy line 712-714)
      await courseRepository.update({ id: course.id }, { isConfirmed: 1 });

    // Confirm all lessons (matching legacy line 762-764)
    // Use targeted updates so unrelated lesson fields remain unchanged.
    if (lessonsToConfirm.length > 0) {
      const lessonIds = lessonsToConfirm.map((l) => l.id);

      // Update lessons individually
      for (const lesson of lessonsToConfirm) {
        await lessonRepository.update({ id: lesson.id }, { isConfirmed: true });
      }

      // Reload lessons with relations needed for confirmation logic and discounts
      const confirmedLessons = await lessonRepository.find({
        where: lessonIds.map((id) => ({ id })),
        relations: [
          'course',
          'course.program',
          'course.enrolments',
          'course.enrolments.student',
          'course.enrolments.student.user',
          'course.enrolments.discounts',
        ],
      });

      // Process each lesson (matching legacy lines 750-777)
      for (const lesson of confirmedLessons) {
        // 1. makeAsRoot() - Create lesson_hierarchy entry (matching legacy line 749-752)
          const existingHierarchy = await lessonHierarchyRepository.findOne({
            where: {
              lessonId: lesson.id,
              childLessonId: lesson.id,
            },
          });

          if (!existingHierarchy) {
            const hierarchy = lessonHierarchyRepository.create({
              lessonId: lesson.id,
              childLessonId: lesson.id,
              depth: 0,
            });
            await lessonHierarchyRepository.save(hierarchy);
          }

        // 2. setExpiry() - Create private_lesson for private programs (matching legacy line 1407-1422)
        if (isPrivateProgram) {
          const existingPrivateLesson = await privateLessonRepository.findOne({
            where: { lessonId: lesson.id },
          });

          if (!existingPrivateLesson) {
            // Calculate expiryDate: lesson date + 90 days (matching legacy line 1416)
            // Use dayjs to preserve UTC time (no timezone conversion)
            const dayjs = require('dayjs');
            const utc = require('dayjs/plugin/utc');
            dayjs.extend(utc);

            const lessonDate = new Date(lesson.date);
            const expiryDate = dayjs.utc(lessonDate).add(90, 'day').toDate();

            // Use lesson.total which was set during creation using discountedRatePerMonth / 4
            // Per lesson price = discountedRatePerMonth / 4 (sent from UI)
            const total = lesson.total > 0 ? lesson.total : 0; // Should always be set during creation

            const balance = total; // On insert, balance = total (matching legacy line 169)

            const privateLesson = privateLessonRepository.create({
              lessonId: lesson.id,
              expiryDate,
              total: RoundingUtils.roundDecimal(total, 2),
              balance: RoundingUtils.roundDecimal(balance, 2),
              dueDate: dayjs.utc(lessonDate).startOf('day').toDate(), // YYYY-MM-DD (midnight UTC)
            });
            await privateLessonRepository.save(privateLesson);
          }

          // Schedule previews already create financial records; reminders are independent.
          await ensurePrivateLessonEmailStatuses(
            privateLessonEmailStatusRepository,
            [lesson.id],
          );
        }

        // 3. setDiscount() - Apply discounts for private lessons (matching legacy line 765-767)
        if (isPrivateProgram) {
          // Get enrolment for this lesson
          const lessonEnrolment = lesson.course?.enrolments?.[0];

          if (
            lessonEnrolment &&
            lessonEnrolment.student &&
            lessonEnrolment.student.user
          ) {
            const customer = lessonEnrolment.student.user;
            const customerId = customer.id;

            // 3.1. Customer Discount (matching legacy addCustomerDiscount, lines 1584-1600)
            const customerDiscount = await customerDiscountRepository.findOne({
              where: {
                customerId,
                isDeleted: false,
              },
            });

            if (customerDiscount && customerDiscount.value) {
              // Check if discount already exists for this lesson
              const existingCustomerDiscount =
                await lessonDiscountRepository.findOne({
                  where: {
                    lessonId: lesson.id,
                    type: 1, // TYPE_CUSTOMER
                  },
                });

              if (!existingCustomerDiscount) {
                const lessonDiscount = lessonDiscountRepository.create({
                  lessonId: lesson.id,
                  type: 1, // TYPE_CUSTOMER
                  valueType: 1, // VALUE_TYPE_PERCENTAGE (legacy: 1 = percentage, 0 = dollar)
                  value: customerDiscount.value,
                  enrolmentId: lessonEnrolment.id,
                });
                await lessonDiscountRepository.save(lessonDiscount);
              }
            }

            // 3.2. Payment Frequency Discount (matching legacy addPFDiscount, lines 1602-1618)
            // Load enrolment discounts if not already loaded
            let enrolmentDiscounts = lessonEnrolment.discounts;
            if (!enrolmentDiscounts || enrolmentDiscounts.length === 0) {
              enrolmentDiscounts = await enrolmentDiscountRepository.find({
                where: { enrolmentId: lessonEnrolment.id },
              });
            }

            const paymentFrequencyDiscount = enrolmentDiscounts?.find(
              (d) => d.type === EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY, // Should be 1
            );

            if (paymentFrequencyDiscount && paymentFrequencyDiscount.discount) {
              const existingPFDiscount = await lessonDiscountRepository.findOne(
                {
                  where: {
                    lessonId: lesson.id,
                    type: 2, // TYPE_ENROLMENT_PAYMENT_FREQUENCY
                  },
                },
              );

              if (!existingPFDiscount) {
                const lessonDiscount = lessonDiscountRepository.create({
                  lessonId: lesson.id,
                  type: 2, // TYPE_ENROLMENT_PAYMENT_FREQUENCY
                  valueType: 1, // VALUE_TYPE_PERCENTAGE (legacy: 1 = percentage, 0 = dollar)
                  value: paymentFrequencyDiscount.discount,
                  enrolmentId: lessonEnrolment.id,
                });
                await lessonDiscountRepository.save(lessonDiscount);
              }
            }

            // 3.3. Multi-Enrolment Discount (matching legacy addEnrolmentDiscount, lines 1687-1703)
            const multiEnrolmentDiscount = enrolmentDiscounts?.find(
              (d) => d.type === EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT, // Should be 2
            );

            if (multiEnrolmentDiscount && multiEnrolmentDiscount.discount) {
              const existingMultiDiscount =
                await lessonDiscountRepository.findOne({
                  where: {
                    lessonId: lesson.id,
                    type: 3, // TYPE_MULTIPLE_ENROLMENT
                  },
                });

              if (!existingMultiDiscount) {
                // Value is discount / 4 (matching legacy line 1700)
                const discountValue = multiEnrolmentDiscount.discount / 4;
                // Map discountType: 0 = percentage, 1 = dollar (EnrolmentDiscount) to legacy: 1 = percentage, 0 = dollar (LessonDiscount)
                // If discountType is 0 (percentage), use 1; if 1 (dollar), use 0
                const valueType =
                  multiEnrolmentDiscount.discountType ===
                  EnrolmentDiscount.VALUE_TYPE_PERCENTAGE
                    ? 1 // Legacy VALUE_TYPE_PERCENTAGE
                    : 0; // Legacy VALUE_TYPE_DOLLAR

                const lessonDiscount = lessonDiscountRepository.create({
                  lessonId: lesson.id,
                  type: 3, // TYPE_MULTIPLE_ENROLMENT
                  valueType: valueType,
                  value: discountValue,
                  enrolmentId: lessonEnrolment.id,
                });
                await lessonDiscountRepository.save(lessonDiscount);
              }
            }
          }
        }
      }

      const createPaymentCycleLessonLinks = async (
        paymentCycleId: number,
        targetCourseId: number,
        start: Date,
        end: Date,
      ): Promise<void> => {
          await this.createPaymentCycleLessons(
            paymentCycleId,
            targetCourseId,
            start,
            end,
          );
      };

      // 4. Update course and enrolment dates (matching legacy Course::updateDates() and EnrolmentConfirm queue job)
      if (confirmedLessons.length > 0 && isPrivateProgram) {
        const firstLesson = confirmedLessons[0];
        const lastLesson = confirmedLessons[confirmedLessons.length - 1];

        const firstLessonDate = new Date(firstLesson.date);
        const lastLessonDate = new Date(lastLesson.date);

        await courseRepository.update(
          { id: course.id },
          {
                startDate: firstLessonDate,
                endDate: lastLessonDate,
              },
        );

        // Get enrolment for this course with payment frequency
        const enrolment = await enrolmentRepository.findOne({
          where: { courseId: course.id, isDeleted: false },
          relations: ['student', 'student.user', 'paymentFrequency'],
        });

        if (enrolment) {
          enrolmentId = enrolment.id;

          // Confirm enrolment (matching legacy EnrolmentConfirm queue job, line 30)
          await enrolmentRepository.update(
            { id: enrolment.id },
            { isConfirmed: 1 },
          );

          // Update enrolment endDateTime (matching legacy Course::updateDates() lines 271-273)
          await enrolmentRepository.update(
            { id: enrolment.id },
            { endDateTime: lastLessonDate },
          );

            // Set isEnableInfo for regular confirmation (matching legacy line 807)
            await enrolmentRepository.update(
              { id: enrolment.id },
              { isEnableInfo: true },
            );

          // Confirm customer status for the newly confirmed enrolment.
            await this.confirmCustomer(enrolment.id, userId || 0, locationSlug);

          // 4.1. Set Payment Cycles (matching legacy EnrolmentConfirm queue job, line 32)
          // Get enrolment payment frequency to get paymentCycleStartDate
          const enrolmentPaymentFrequency =
            await enrolmentPaymentFrequencyRepository.findOne({
              where: { enrolmentId: enrolment.id, isDeleted: false },
            });

          if (enrolmentPaymentFrequency && enrolment.paymentFrequency) {
            // Check if payment cycles already exist (matching legacy hasPaymentCycles())
            const existingCycles = await paymentCycleRepository.find({
              where: { enrolmentId: enrolment.id, isDeleted: 0 },
            });

            if (existingCycles.length === 0) {
              const paymentCycleStartDate = new Date(
                enrolmentPaymentFrequency.paymentCycleStartDate,
              );
              const courseStartDate = new Date(course.startDate);
              const courseEndDate = new Date(lastLessonDate);
              const frequencyLength =
                enrolment.paymentFrequency.frequencyLength;

              // Format dates to Y-m-1 (first day of month) for comparison (matching legacy line 843)
              const paymentCycleStartMonth = new Date(
                paymentCycleStartDate.getFullYear(),
                paymentCycleStartDate.getMonth(),
                1,
              );
              const courseStartMonth = new Date(
                courseStartDate.getFullYear(),
                courseStartDate.getMonth(),
                1,
              );

              // If paymentCycleStartDate month > course startDate month, create initial partial cycle (matching legacy lines 843-851)
              if (paymentCycleStartMonth > courseStartMonth) {
                const initialCycleStart = new Date(courseStartMonth);
                // End date: last day of month before paymentCycleStartDate month
                const initialCycleEnd = new Date(paymentCycleStartMonth);
                initialCycleEnd.setDate(0); // Last day of previous month

                const initialCycle = paymentCycleRepository.create({
                  enrolmentId: enrolment.id,
                  startDate: initialCycleStart,
                  endDate: initialCycleEnd,
                  isDeleted: 0,
                  isPreferredPaymentEnabled: false,
                });
                const savedInitialCycle =
                  await paymentCycleRepository.save(initialCycle);
                // Legacy parity: saving a payment cycle also linked all lessons in that range.
                // This restores the implicit PaymentCycle::afterSave() side effect from Yii.
                await createPaymentCycleLessonLinks(
                  savedInitialCycle.id,
                  course.id,
                  initialCycleStart,
                  initialCycleEnd,
                );
              }

              // Create payment cycles for 24 months (matching legacy line 856: (int) 24 / frequencyLength)
              const maxCycles = Math.floor(24 / frequencyLength);
              let paymentCycleStart = new Date(paymentCycleStartMonth);
              let endDate: Date | null = null;

              for (let i = 0; i <= maxCycles; i++) {
                if (i > 0) {
                  // First day of next month (matching legacy line 858)
                  paymentCycleStart = new Date(endDate!);
                  paymentCycleStart.setMonth(
                    paymentCycleStart.getMonth() + 1,
                    1,
                  );
                }

                // Calculate end date: startDate + frequencyLength months - 1 day (matching legacy line 863)
                endDate = new Date(paymentCycleStart);
                endDate.setMonth(endDate.getMonth() + frequencyLength);
                endDate.setDate(0); // Last day of previous month

                // Adjust end date if it exceeds course end date (matching legacy lines 867-868)
                const courseEndDateStr = courseEndDate
                  .toISOString()
                  .split('T')[0];
                const cycleEndDateStr = endDate.toISOString().split('T')[0];

                if (cycleEndDateStr > courseEndDateStr) {
                  // Set to last day of course end date month (matching legacy line 868: format('Y-m-t'))
                  endDate = new Date(
                    courseEndDate.getFullYear(),
                    courseEndDate.getMonth() + 1,
                    0,
                  );
                }

                // Only create cycle if startDate is before course endDate (matching legacy line 870)
                const cycleStartDateStr = paymentCycleStart
                  .toISOString()
                  .split('T')[0];
                if (cycleStartDateStr < courseEndDateStr) {
                  const paymentCycle = paymentCycleRepository.create({
                    enrolmentId: enrolment.id,
                    startDate: paymentCycleStart,
                    endDate,
                    isDeleted: 0,
                    isPreferredPaymentEnabled: false,
                  });
                  const savedPaymentCycle =
                    await paymentCycleRepository.save(paymentCycle);
                  // Legacy parity: each newly created cycle must also create the lesson links.
                  // Without this, pro-forma invoice and payment-cycle billing queries lose their join path.
                  await createPaymentCycleLessonLinks(
                    savedPaymentCycle.id,
                    course.id,
                    paymentCycleStart,
                    endDate,
                  );
                }
              }
            }

            // 4.1b. Put the cycles just built onto Arcadia's published prepaid
            // prices.
            //
            // Here rather than at enrolment creation because prepaid attaches to
            // the lessons *in a cycle*, so it needs the cycles and their lesson
            // links to exist - which is what the block above has just created.
            //
            // Never allowed to fail the confirmation. The service catches its
            // own errors and reports what it skipped; this guard only covers it
            // being absent, which is the spec's `new`-with-positional-arguments
            // path.
            if (this.enrolmentPrepaidPricing) {
              await this.enrolmentPrepaidPricing.applyForEnrolment({
                  enrolmentId: enrolment.id,
                  frequencyLength: enrolment.paymentFrequency.frequencyLength,
              });
            }
          }

          // 4.2. Set lesson due dates from stable payment-cycle boundaries.
          // Get all confirmed, non-canceled lessons for this enrolment
          const confirmedLessonsForDueDate = await lessonRepository.find({
            where: {
              courseId: course.id,
              isConfirmed: true,
              isDeleted: false,
              status: Not(LessonStatusEnum.CANCELED),
            },
            relations: ['course'],
            order: {
              date: 'ASC',
            },
          });

          // Get payment cycles for this enrolment
          const paymentCycles = await paymentCycleRepository.find({
            where: {
              enrolmentId: enrolment.id,
              isDeleted: 0,
            },
            order: {
              startDate: 'ASC',
            },
          });

          const toDateKey = (value: Date | string): string =>
            new Date(value).toISOString().split('T')[0];

          // Precompute cycle ranges and their stable due dates in memory. The
          // first linked billing occurrence can begin after a stored boundary,
          // so it acts as a lower bound for the billing month.
          const paymentCycleRanges = paymentCycles.map((paymentCycle) => {
            const startStr = toDateKey(paymentCycle.startDate);
            const endStr = toDateKey(paymentCycle.endDate);
            const cycleLessons = confirmedLessonsForDueDate.filter((lesson) => {
              const lessonDateStr = toDateKey(lesson.date);
              return lessonDateStr >= startStr && lessonDateStr <= endStr;
            });

            return {
              id: paymentCycle.id,
              startStr,
              endStr,
              dueDate: calculatePaymentCycleDueDate(
                paymentCycle.startDate,
                cycleLessons.map(
                  (lesson) => lesson.originalDate ?? lesson.date,
                ),
              ),
            };
          });

          const dueDateUpdates: Array<{ lessonId: number; dueDate: Date }> = [];

          // For each lesson, find its payment cycle and calculate due date
          for (const lesson of confirmedLessonsForDueDate) {
            const lessonDateStr = toDateKey(lesson.date);

            for (const cycleRange of paymentCycleRanges) {
              // Check if lesson date falls within this payment cycle
              if (
                lessonDateStr >= cycleRange.startStr &&
                lessonDateStr <= cycleRange.endStr
              ) {
                dueDateUpdates.push({
                  lessonId: lesson.id,
                  dueDate: cycleRange.dueDate,
                });
                break; // Found the payment cycle, no need to check others
              }
            }
          }

          // Keep same update semantics while reducing end-to-end latency with chunked parallel updates.
          const dueDateUpdateChunkSize = 25;
          for (
            let i = 0;
            i < dueDateUpdates.length;
            i += dueDateUpdateChunkSize
          ) {
            const chunk = dueDateUpdates.slice(i, i + dueDateUpdateChunkSize);
            await Promise.all(
              chunk.map(({ lessonId, dueDate }) =>
                lessonRepository.update({ id: lessonId }, { dueDate }),
              ),
            );
          }

          // 4.3. Update Customer Account Balance (matching legacy User::updateCustomerBalance(), lines 1150-1165)
          if (enrolment.student && enrolment.student.user) {
            const customerId = enrolment.student.user.id;
              await this.updateCustomerBalance(customerId);
            }
          }
        }
      }

    // Get enrolment ID if not already fetched
    if (!enrolmentId) {
      const enrolment = await enrolmentRepository.findOne({
        where: { courseId: course.id, isDeleted: false },
        select: ['id'],
      });
      enrolmentId = enrolment?.id || null;
    }

    // TODO: Push queue jobs for notifications if needed (MakeLessonAsRoot, LessonConfirm, EnrolmentConfirm)
    return enrolmentId;
  }

  /**
   * Create payment cycle lesson links for a date range.
   * Mirrors the legacy PaymentCycle::afterSave() side effect, which inserted
   * payment_cycle_lesson rows immediately after a payment cycle was saved.
   */
  private async createPaymentCycleLessons(
    paymentCycleId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const { lessonRepository, paymentCycleLessonRepository } =
      this.getScopedRepositories(manager);

    const startDateNormalized = new Date(startDate);
    startDateNormalized.setHours(0, 0, 0, 0);

    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(23, 59, 59, 999);

    // Only confirmed, active lessons participate in payment-cycle billing.
    const lessons = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.date >= :startDate', { startDate: startDateNormalized })
      .andWhere('lesson.date <= :endDate', { endDate: endDateNormalized })
      .orderBy('COALESCE(lesson.originalDate, lesson.date)', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .getMany();

    if (lessons.length === 0) {
      return;
    }

    const lessonIds = lessons.map((lesson) => lesson.id);
    const existingLinks = await paymentCycleLessonRepository
      .createQueryBuilder('pcl')
      .where('pcl.paymentCycleId = :paymentCycleId', { paymentCycleId })
      .andWhere('pcl.lessonId IN (:...lessonIds)', { lessonIds })
      .getMany();

    const existingLinkMap = new Map(
      existingLinks.map((link) => [
        `${link.paymentCycleId}-${link.lessonId}`,
        link,
      ]),
    );
    const linksToCreate: Array<{
      paymentCycleId: number;
      lessonId: number;
      isDeleted: number;
    }> = [];
    const linksToRestore: PaymentCycleLesson[] = [];

    for (const lesson of lessons) {
      const key = `${paymentCycleId}-${lesson.id}`;
      const existingLink = existingLinkMap.get(key);

      if (existingLink) {
        if (existingLink.isDeleted === 0) {
          // Keep active links untouched to avoid duplicate rows on repeat confirmation.
          continue;
        }

        // Restore soft-deleted links instead of creating a second row for the same cycle/lesson pair.
        linksToRestore.push(existingLink);
        continue;
      }

      // Create the missing link so invoice and payment queries can resolve this cycle.
      linksToCreate.push({
        paymentCycleId,
        lessonId: lesson.id,
        isDeleted: 0,
      });
    }

    if (linksToRestore.length > 0) {
      // Bring back previously deleted links to match the legacy soft-delete behavior.
      for (const link of linksToRestore) {
        link.isDeleted = 0;
      }
      await paymentCycleLessonRepository.save(linksToRestore);
    }

    if (linksToCreate.length > 0) {
      // Bulk insert the new links so cycle-to-lesson joins are available immediately.
      await paymentCycleLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PaymentCycleLesson)
        .values(linksToCreate)
        .execute();
    }
  }

  /**
   * Confirm Customer - Updates student/customer status and triggers events
   * Matching legacy LessonConfirm::confirmCustomer() (lines 136-143)
   *
   * @param enrolmentId - The enrolment ID
   * @returns Promise<boolean>
   */
  async confirmCustomer(
    enrolmentId: number,
    loggedUserId?: number,
    locationSlug?: string,
  ): Promise<boolean> {
    try {
      // Get enrolment with student and user relations
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: enrolmentId, isDeleted: false },
        relations: [
          'student',
          'student.user',
          'course',
          'course.program',
          'course.teacher',
          'course.teacher.profile',
          'course.courseSchedule',
        ],
      });

      if (!enrolment) {
        throw new NotFoundException(
          `Enrolment with ID ${enrolmentId} not found`,
        );
      }

      // Update student and user status and isDeleted (matching legacy Enrolment::setStatus() lines 920-939)
      if (enrolment.student) {
        // Check if student has any active enrolments
        const allEnrolments = await this.enrolmentRepository.find({
          where: { studentId: enrolment.student.id, isDeleted: false },
          relations: ['course'],
        });

        let studentStatus = 2; // STATUS_INACTIVE
        let userStatus = 1; // STATUS_NOT_ACTIVE

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        for (const enrol of allEnrolments) {
          if (enrol.course && enrol.course.endDate) {
            const endDate = new Date(enrol.course.endDate);
            endDate.setHours(0, 0, 0, 0);

            // Active if the enrolment has not yet ended. This matches the
            // canonical Enrolment.isActive() in enrolment.service (endDate >=
            // today) — a future start date still counts as active. Previously
            // this also required today >= startDate, which wrongly left a
            // customer Inactive until their first (future-dated) lesson, even
            // after the enrolment was created and confirmed.
            const isActive = currentDate <= endDate;

            if (isActive) {
              studentStatus = 1; // STATUS_ACTIVE
              userStatus = 2; // STATUS_ACTIVE
              break;
            }
          }
        }

        // Update student status and isDeleted
        await this.studentRepository.update(
          { id: enrolment.student.id },
          {
            status: studentStatus,
            isDeleted: 0, // 0 = false (tinyint)
          },
        );

        // Update user status and isDeleted
        if (enrolment.student.user) {
          await this.userRepository.update(
            { id: enrolment.student.user.id },
            {
              status: userStatus,
              isDeleted: false, // boolean
            },
          );
        }
      }

      if (loggedUserId && locationSlug) {
        await this.createCustomerEnrolmentLog(
          enrolment,
          loggedUserId,
          locationSlug,
        );
      }

      // NOTE: Legacy triggers Enrolment::EVENT_AFTER_INSERT event here (line 141)
      // This event creates audit trail entries (student log)
      // Skipping event trigger as per user's request to skip queue/event-related tasks for later
      // TODO: Implement event trigger when audit trail system is available
      // enrolment.trigger(Enrolment::EVENT_AFTER_INSERT);

      return true;
    } catch (error) {
      console.error('Error in confirmCustomer:', error);
      throw error;
    }
  }

  private async createCustomerEnrolmentLog(
    enrolment: Enrolment,
    loggedUserId: number,
    locationSlug: string,
  ): Promise<void> {
    try {
      if (!this.auditLogWriterService) {
        return;
      }

      const loggedUser = await this.userRepository.findOne({
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      if (!loggedUser || !enrolment.student || !enrolment.course?.program) {
        return;
      }

      const course = enrolment.course;
      const teacher = course.teacher;
      const courseSchedule =
        course.courseSchedule?.find((schedule) => schedule.isRecent) ??
        course.courseSchedule?.[0];

      if (!teacher) {
        return;
      }

      const loggedUserName = getDisplayName(loggedUser);
      const studentName = getDisplayName(enrolment.student, 'Student');
      const teacherName = getDisplayName(teacher);
      const dayList = getWeekdaysList();
      const day = courseSchedule?.day
        ? dayList[courseSchedule.day] || 'Unknown'
        : 'Unknown';
      const dayPlural = day !== 'Unknown' ? `${day}s` : 'Unknown';
      const time = course.startDate
        ? formatTime(course.startDate) || 'Unknown'
        : 'Unknown';
      const programName = course.program.name?.trim() || 'Unknown';
      const studentPath = `/v2/admin/${locationSlug}/students/${enrolment.student.id}`;
      const teacherPath = `/v2/admin/${locationSlug}/teachers/${teacher.id}`;

      const logData = JSON.stringify({
        id: enrolment.id,
        courseId: enrolment.courseId,
        studentId: enrolment.studentId,
        isDeleted: enrolment.isDeleted ? '1' : '0',
        endDateTime: enrolment.endDateTime
          ? enrolment.endDateTime.toISOString()
          : null,
        paymentFrequencyId: enrolment.paymentFrequencyId,
        isConfirmed: enrolment.isConfirmed ? '1' : '0',
        isAutoRenew: enrolment.isAutoRenew ? '1' : '0',
        is_online: enrolment.isOnline ? '1' : '0',
        createdAt: enrolment.createdAt
          ? enrolment.createdAt.toISOString()
          : null,
        updatedAt: enrolment.updatedAt
          ? enrolment.updatedAt.toISOString()
          : null,
        createdByUserId: enrolment.createdByUserId,
        updatedByUserId: enrolment.updatedByUserId,
        isEnableInfo: enrolment.isEnableInfo ? '1' : '0',
        isEnableRescheduleInfo: enrolment.isEnableRescheduleInfo ? '1' : '0',
      });

      await this.auditLogWriterService.writeAuditLog({
        objectType: LogObjectType.STUDENT,
        activityType: LogActivityType.TYPE_CREATE,
        message: `${loggedUserName} enrolled  {{${studentName}}} in ${programName}  lessons with {{${teacherName}}} on ${dayPlural} at ${time}`,
        data: logData,
        locationId: course.locationId,
        createdUserId: loggedUserId,
        mainLink: {
          index: studentName,
          path: studentPath,
        },
        mainHistory: {
          instanceId: enrolment.student.id,
          instanceType: LogObjectType.STUDENT,
        },
        extraLinks: [
          {
            index: teacherName,
            path: teacherPath,
          },
        ],
      });
    } catch (error) {
      console.error('Error creating customer enrolment log:', error);
    }
  }

  /**
   * Update Customer Account Balance
   * Matching legacy User::updateCustomerBalance() (lines 1150-1165)
   *
   * Formula: balance = getLessonsDue() + getInvoiceOwingAmountTotal() - getTotalCredits()
   *
   * @param customerId - The customer/user ID
   * @returns Promise<void>
   */
  async updateCustomerBalance(
    customerId: number,
    options: {
      manager?: EntityManager;
      strict?: boolean;
      updatedByUserId?: number;
      locationSlug?: string;
    } = {},
  ): Promise<void> {
    const { manager, strict = false, updatedByUserId, locationSlug } = options;

    try {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        customerId,
        {
          manager,
          updatedByUserId,
          locationSlug,
        },
      );
    } catch (error) {
      if (strict) {
        throw error;
      }

      console.error('Error in updateCustomerBalance:', error);
      // Don't throw error - balance update failure shouldn't break lesson confirmation
      // Log error for monitoring
    }
  }
}
