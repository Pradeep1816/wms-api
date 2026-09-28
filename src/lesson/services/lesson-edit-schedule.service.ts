import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { LocationService } from '../../location/services/location.service';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { GroupLesson } from '../entities/group-lesson.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { TeacherOverlapValidator } from '../validators/teacher-overlap.validator';
import { StudentOverlapValidator } from '../validators/student-overlap.validator';
import { TeacherEligibilityValidator } from '../validators/teacher-eligibility.validator';
import { LessonEditScheduleRepository } from '../repositories/lesson-edit-schedule.repository';
import { TeacherSubstitutePrivateLessonHelper } from '../repositories/helpers/teacher-substitute/teacher-substitute-private-lesson.helper';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { LessonEditScheduleRequestDto } from '../dto/lesson-edit-schedule-request.dto';
import { ProgramTypeEnum } from 'src/program/enums/program-type';
import {
  getCurrentESTDate,
  parseDateAsUTC,
  parseDateFromIso,
} from 'src/utils/date-utils';
import { publicProgramName } from '../../pricing/utils/program-public-name';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface LessonEditScheduleResponseDto {
  status: boolean;
  url?: string;
  message?: string;
  lesson?: {
    lessonId: number;
    isOwing: boolean;
    isOwingRentalAgreement: boolean;
    isOnline: boolean;
    resourceId: number;
    title: string;
    start: string;
    end: string;
    url: string;
    className: string;
    backgroundColor: string;
    tooltip?: { name: string; value: string }[];
  };
}

/**
 * Service for editing lesson schedules for both private and group lessons.
 * Core Logic :
 * 1. Check if lesson is invoiced - "Lesson can't be edited once invoiced"
 * 2. Cancel old lesson (status = 4 = CANCELED)
 * 3. Validate teacher eligibility if teacher changed
 * 4. Validate teacher overlap if date/time/duration changed
 * 5. Validate student overlap for private lessons if date/time/duration changed
 * 6. Create new lesson with updated data
 * 7. Copy/update private_lesson or group_lesson records
 * 8. Copy discounts and create lesson hierarchy
 * 9. Update customer balance
 */
@Injectable()
export class LessonEditScheduleService {
  private readonly logger = new Logger(LessonEditScheduleService.name);

  constructor(
    private readonly locationService: LocationService,
    private readonly repository: LessonEditScheduleRepository,
    private readonly privateLessonHelper: TeacherSubstitutePrivateLessonHelper,
    private readonly teacherOverlapValidator: TeacherOverlapValidator,
    private readonly studentOverlapValidator: StudentOverlapValidator,
    private readonly teacherEligibilityValidator: TeacherEligibilityValidator,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Edit schedule for a lesson (private or group).
   * 100% Legacy Identical to PHP implementation.
   */
  async editSchedule(
    locationSlug: string,
    locationId: number,
    lessonId: number,
    updateDto: LessonEditScheduleRequestDto,
    createdByUserId: number,
  ): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] request locationId=${locationId} lessonId=${lessonId} payload=${JSON.stringify(
          {
            teacherId: updateDto?.teacherId ?? null,
            date: updateDto?.date ?? null,
            duration: updateDto?.duration ?? null,
            expiryDate: updateDto?.expiryDate ?? null,
          },
        )}`,
      );

      // Step 1: Find lesson with all required relations
      const oldLesson = await this.repository.findLessonByIdAndLocation(
        lessonId,
        locationId,
        queryRunner,
      );
      if (!oldLesson) {
        throw new NotFoundException('Lesson not found');
      }
      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] oldLesson id=${oldLesson.id} type=${oldLesson.type} teacherId=${oldLesson.teacherId} date=${oldLesson.date?.toISOString?.() ?? oldLesson.date} duration=${oldLesson.duration} status=${oldLesson.status} expiryDate=${oldLesson.privateLesson?.[0]?.expiryDate?.toISOString?.() ?? oldLesson.privateLesson?.[0]?.expiryDate ?? 'null'}`,
      );
      const programType = oldLesson.course?.program?.type;
      const isPrivateLesson = programType === ProgramTypeEnum.PRIVATE_PROGRAM;
      const isGroupLesson = programType === ProgramTypeEnum.GROUP_PROGRAM;

      if (!isPrivateLesson && !isGroupLesson) {
        throw new BadRequestException(
          'Only private and group lessons can be edited',
        );
      }

      const hasDateField = Object.prototype.hasOwnProperty.call(
        updateDto,
        'date',
      );
      const rawDate =
        typeof updateDto.date === 'string'
          ? updateDto.date.trim()
          : updateDto.date;
      const isCurrentlyUnscheduled =
        oldLesson.status === LessonStatusEnum.UNSCHEDULED;
      const newTeacherId = updateDto.teacherId ?? oldLesson.teacherId;
      const isTeacherChanged =
        Number(newTeacherId) !== Number(oldLesson.teacherId);
      const rawDuration = updateDto.duration ?? oldLesson.duration;
      const normalizedDuration = String(rawDuration ?? '').trim();
      const isDurationChanged =
        this.parseDurationToSeconds(normalizedDuration) !==
        this.parseDurationToSeconds(String(oldLesson.duration ?? ''));

      // Legacy parity:
      // 1) empty date keeps/sets lesson as unscheduled (no clone/new lesson created)
      // 2) if lesson is already unscheduled and client omits date while editing
      //    (e.g. expiry-only update), keep it unscheduled instead of rescheduling
      if (
        (hasDateField && (!rawDate || rawDate === '')) ||
        (isCurrentlyUnscheduled && !hasDateField)
      ) {
        let teacherRate = Number(oldLesson.teacherRate ?? 0);
        if (isTeacherChanged) {
          await this.teacherEligibilityValidator.validateTeacherEligibility(
            Number(newTeacherId),
            oldLesson.id,
            locationId,
          );
          teacherRate = await this.getTeacherRateForProgram(
            Number(newTeacherId),
            oldLesson.course?.program?.id,
            queryRunner,
          );
        }

        // Legacy parity: private expiry date is still saved before unscheduling.
        if (isPrivateLesson && updateDto.expiryDate) {
          const parsedExpiryDate = parseDateFromIso(
            updateDto.expiryDate,
          );
          if (isNaN(parsedExpiryDate.getTime())) {
            throw new BadRequestException('Invalid expiry date format');
          }
          this.logger.log(
            `[EDIT_SCHEDULE_DEBUG] unschedule-expiry oldLessonId=${oldLesson.id} incomingExpiry=${updateDto.expiryDate} parsedExpiry=${parsedExpiryDate.toISOString()}`,
          );
          await this.repository.updatePrivateLessonExpiryDate(
            oldLesson.id,
            parsedExpiryDate,
            queryRunner,
          );
          if (oldLesson.privateLesson?.[0]) {
            oldLesson.privateLesson[0].expiryDate = parsedExpiryDate;
          }
        }

        const updateResult = await queryRunner.manager
          .createQueryBuilder()
          .update(Lesson)
          .set({
            teacherId: newTeacherId,
            teacherRate,
            duration: normalizedDuration,
            status: LessonStatusEnum.UNSCHEDULED,
            updatedByUserId: createdByUserId,
            updatedOn: getCurrentESTDate(),
          })
          .where('id = :id', { id: oldLesson.id })
          .execute();

        if (!updateResult.affected) {
          throw new NotFoundException('Lesson not found');
        }

        // Legacy parity: Lesson::afterSave() triggers PrivateLesson::beforeSave(),
        // recalculating total/balance on every unscheduled edit.
        if (isPrivateLesson) {
          await this.recalculatePrivateLessonTotalsForUnscheduledEdit(
            oldLesson,
            normalizedDuration,
            queryRunner,
          );

          // Keep customer account balance in sync in the same transaction.
          await this.recalculateCustomerBalancesStrict(
            this.collectAffectedCustomerIds(oldLesson),
            locationSlug,
            createdByUserId,
            queryRunner,
          );
        }

        await this.repository.updateLessonOriginalDate(
          oldLesson.id,
          oldLesson.date,
          queryRunner,
        );
        await this.repository.updateCourseDates(oldLesson.courseId, queryRunner);
        await queryRunner.commitTransaction();
        this.logger.log(
          `[EDIT_SCHEDULE_DEBUG] unschedule-complete lessonId=${oldLesson.id} status=${LessonStatusEnum.UNSCHEDULED} teacherId=${newTeacherId} teacherRate=${teacherRate} duration=${normalizedDuration}`,
        );
        return {
          status: true,
          url: `admin/v2/${locationSlug}/lesson/${oldLesson.id}`,
        };
      }

      // Step 2: Check if invoiced
      const isInvoiced = await this.repository.isLessonInvoiced(
        oldLesson.id,
        queryRunner,
      );
      if (isInvoiced) {
        throw new BadRequestException("Lesson can't be edited once invoiced");
      }

      // Step 3: Cancel old lesson - legacy: lesson status = 4 (CANCELED)
      oldLesson.status = LessonStatusEnum.CANCELED;
      await queryRunner.manager.save(Lesson, oldLesson);

      // Parse and validate inputs
      let newDate = updateDto.date
        ? this.parseDate(updateDto.date)
        : oldLesson.date;

      if (isNaN(newDate.getTime())) {
        throw new BadRequestException(
          'Invalid date format. Use YYYY-MM-DD h:mm AM/PM',
        );
      }

      // Track original teacher ID for substitution logic
      const originalTeacherId = oldLesson.teacherId;

      // Step 4: Validate teacher eligibility if teacher is being changed
      if (
        updateDto.teacherId !== undefined &&
        Number(updateDto.teacherId) !== Number(originalTeacherId)
      ) {
        await this.teacherEligibilityValidator.validateTeacherEligibility(
          updateDto.teacherId,
          oldLesson.id,
          locationId,
        );
      }

      // Get color lookup for rescheduled lessons
      const colorLookup = await this.repository.getColorLookup(queryRunner);

      let lessonStatus: number;
      let lessonColorCode: string | null = null;
      const isDateChanged = oldLesson.date.getTime() !== newDate.getTime();
      const hierarchy = (oldLesson as Lesson & {
        lessonHierarchy?: Array<{ lesson?: { date: Date } | null }> | null;
      }).lessonHierarchy;
      const rootLesson = hierarchy?.[0]?.lesson || null;
      const shouldStayRescheduled =
        !!rootLesson && new Date(rootLesson.date).getTime() !== newDate.getTime();
      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] computed oldLessonId=${oldLesson.id} oldTeacherId=${originalTeacherId} newTeacherId=${newTeacherId} oldDate=${oldLesson.date?.toISOString?.() ?? oldLesson.date} newDate=${newDate.toISOString()} oldDuration=${oldLesson.duration} newDuration=${normalizedDuration} isDateChanged=${isDateChanged}`,
      );

      // Determine status and color based on changes
      if (shouldStayRescheduled || isDateChanged) {
        lessonStatus = LessonStatusEnum.RESCHEDULED;
        lessonColorCode = colorLookup['lesson-rescheduled'] || null;
      } else {
        lessonStatus = LessonStatusEnum.SCHEDULED;
      }

      // Check for teacher substitution color
      if (
        updateDto.teacherId !== undefined &&
        originalTeacherId !== updateDto.teacherId
        && lessonStatus !== LessonStatusEnum.RESCHEDULED
      ) {
        lessonColorCode = colorLookup['teacher-substituted'] || null;
      }

      // Step 5: Validate teacher overlap if teacher, date, or duration is being updated
      if (
        updateDto.teacherId !== undefined ||
        updateDto.date ||
        updateDto.duration
      ) {
        await this.teacherOverlapValidator.validateTeacherOverlap(
          newTeacherId,
          oldLesson.id,
          newDate,
          normalizedDuration,
          locationId,
        );
      }

      // Step 6: Validate student overlap for private lessons only
      if ((updateDto.date || updateDto.duration) && isPrivateLesson) {
        await this.studentOverlapValidator.validateStudentOverlap(
          oldLesson.id,
          newDate,
          normalizedDuration,
          locationId,
        );
      }

      // Step 7: Create new lesson
      const currentUpdateDate = getCurrentESTDate();
      const {
        privateLesson,
        groupLesson,
        lessonPayment,
        teacher: oldTeacherRelation,
        ...lessonData
      } = oldLesson as any;
      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] clone-source oldLessonId=${oldLesson.id} sourceTeacherRelationId=${oldTeacherRelation?.id ?? 'null'} sourceTeacherId=${lessonData.teacherId} targetTeacherId=${newTeacherId}`,
      );
      const newTeacherRate =
        Number(newTeacherId) !== Number(originalTeacherId)
          ? await this.getTeacherRateForProgram(
              Number(newTeacherId),
              oldLesson.course?.program?.id,
              queryRunner,
            )
          : Number(oldLesson.teacherRate ?? 0);
      const colorNormalizationLesson = {
        ...oldLesson,
        status: lessonStatus,
      } as Lesson;
      const resolvedColorCode =
        lessonColorCode !== undefined && lessonColorCode !== null
          ? this.normalizeLessonColorCode(colorNormalizationLesson, lessonColorCode, colorLookup)
          : this.normalizeLessonColorCode(colorNormalizationLesson, oldLesson.colorCode, colorLookup);

      const newLesson = queryRunner.manager.create(Lesson, {
        ...lessonData,
        id: undefined,
        status: lessonStatus,
        colorCode: resolvedColorCode,
        teacherId: newTeacherId,
        date: newDate,
        duration: normalizedDuration,
        teacherRate: newTeacherRate,
        createdByUserId: createdByUserId,
        updatedByUserId: createdByUserId,
        createdOn: currentUpdateDate,
        updatedOn: currentUpdateDate,
      });
      // Prevent relation object from overriding explicit teacherId on insert.
      (newLesson as any).teacher = undefined;

      const savedNewLesson = await queryRunner.manager.save(Lesson, newLesson);
      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] newLesson-saved oldLessonId=${oldLesson.id} newLessonId=${savedNewLesson.id} teacherId=${savedNewLesson.teacherId} date=${savedNewLesson.date?.toISOString?.() ?? savedNewLesson.date} duration=${savedNewLesson.duration} status=${savedNewLesson.status}`,
      );

      // Handle Private Lesson Data OR Group Lesson Data
      if (isPrivateLesson) {
        await this.handlePrivateLessonData(
          oldLesson.id,
          savedNewLesson.id,
          updateDto,
          queryRunner,
          normalizedDuration,
          isDurationChanged,
        );
      } else {
        await this.handleGroupLessonData(
          oldLesson.id,
          savedNewLesson.id,
          queryRunner,
        );
      }

      // Legacy parity: lesson payments are moved for both private and group flows.
      await this.transferLessonPaymentsWithCreditReferences(
        oldLesson.id,
        savedNewLesson.id,
        queryRunner,
      );

      // Create lesson hierarchy for reschedule tracking (closure table)
      await this.repository.createLessonHierarchy(
        oldLesson.id,
        savedNewLesson.id,
        queryRunner,
      );

      await Promise.all([
        this.repository.updateLessonOriginalDate(
          oldLesson.id,
          oldLesson.date,
          queryRunner,
        ),
        this.repository.updateLessonOriginalDate(
          savedNewLesson.id,
          savedNewLesson.date,
          queryRunner,
        ),
      ]);

      // Legacy parity: create email status rows for newly rescheduled lesson.
      await this.repository.createLessonEmailStatuses(
        savedNewLesson.id,
        oldLesson.courseId,
        isPrivateLesson,
        queryRunner,
      );

      // Recalculate affected customer balances before commit so any failure rolls back edit-schedule.
      await this.recalculateCustomerBalancesStrict(
        this.collectAffectedCustomerIds(oldLesson),
        locationSlug,
        createdByUserId,
        queryRunner,
      );

      await queryRunner.commitTransaction();

      // Reload full lesson for response formatting
      const fullLesson = await this.repository.loadFullLesson(
        savedNewLesson.id,
        queryRunner,
      );

      // Step 12: Check for rental agreements
      let isOwingRentalAgreement = false;
      const student = fullLesson?.course?.enrolments?.[0]?.student;
      if (student) {
        isOwingRentalAgreement = await this.repository.isOwingRentalAgreement(
          student.id,
          queryRunner,
        );
      }

      const className = this.getClassName(
        fullLesson,
        originalTeacherId,
        lessonStatus,
      );
      let backgroundColor = fullLesson.colorCode;
      if (!backgroundColor && className) {
        backgroundColor = colorLookup[className] || '';
      }

      const enrolment = fullLesson?.course?.enrolments?.[0];
      const customerAccount = enrolment?.student?.customerAccount;

      this.logger.log(
        `[EDIT_SCHEDULE_DEBUG] edit-complete oldLessonId=${oldLesson.id} newLessonId=${savedNewLesson.id} finalTeacherId=${newTeacherId} finalDate=${newDate.toISOString()} isPrivateLesson=${isPrivateLesson}`,
      );

      return {
        lessonId: savedNewLesson.id,
        isPrivateLesson,
        isOwing: customerAccount ? customerAccount.balance > 0 : false,
        isOwingRentalAgreement: isOwingRentalAgreement,
        isOnline: !!oldLesson.isOnline,
        resourceId: newTeacherId,
        title: this.getLessonTitle(enrolment),
        start: newDate.toISOString(),
        end: newDate.toISOString(),
        url: `admin/v2/${locationSlug}/${isPrivateLesson ? 'private' : 'group'}-lesson/${savedNewLesson.id}`,
        className,
        backgroundColor,
        tooltip: this.getLessonDescription(fullLesson, enrolment),
      };
    } catch (error) {
      this.logger.error(
        `[EDIT_SCHEDULE_DEBUG] edit-failed locationId=${locationId} lessonId=${lessonId} message=${error?.message ?? 'unknown error'}`,
        error?.stack,
      );
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Parse date string in legacy format: 'yyyy-MM-dd h:mm a'
   */
  private parseDate(dateString: string): Date {
    const normalized = String(dateString).replace(/\+/g, ' ').trim();
    try {
      return parseDateAsUTC(normalized);
    } catch {
      return new Date(NaN);
    }
  }

  /**
   * Check if two dates are same day
   */
  private isSameDate(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Handle private lesson data copying during schedule edit
   */
  private async handlePrivateLessonData(
    oldLessonId: number,
    newLessonId: number,
    updateDto: LessonEditScheduleRequestDto,
    queryRunner: any,
    newDuration: string,
    isDurationChanged = false,
  ): Promise<void> {
    // Get old private lesson
    const oldPrivate = await queryRunner.manager.findOne(PrivateLesson, {
      where: { lessonId: oldLessonId },
    });

    if (!oldPrivate) return;

    // Copy discounts
    await this.repository.copyDiscounts(oldLessonId, newLessonId, queryRunner);

    // Reload new lesson with discounts for calculation
    const newLesson = await queryRunner.manager.findOne(Lesson, {
      where: { id: newLessonId },
      relations: ['discounts'],
    });

    if (!newLesson) {
      throw new Error('New lesson not found after copying discounts');
    }

    const parsedExpiryDate = updateDto.expiryDate
      ? parseDateFromIso(updateDto.expiryDate)
      : null;
    if (parsedExpiryDate && isNaN(parsedExpiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date format');
    }

    const rootPrivateLessonContext = await this.repository.getRootPrivateLessonContext(
      oldLessonId,
      queryRunner,
    );
    const resolvedExpiryDate = parsedExpiryDate
      ?? this.resolveLegacyPrivateLessonExpiryDate(
        newLesson.date,
        rootPrivateLessonContext?.expiryDate,
      );

    const activeEnrolment = await queryRunner.manager.findOne(Enrolment, {
      where: {
        courseId: newLesson.courseId,
        isDeleted: false,
        isConfirmed: 1,
      },
      order: {
        id: 'ASC',
      },
    });
    const enrolmentId = activeEnrolment?.id;

    const pricingLesson = queryRunner.manager.create(Lesson, {
      programRate: newLesson.programRate,
      tax: newLesson.tax,
      duration: newLesson.duration,
      discounts: newLesson.discounts ?? [],
      course: newLesson.course,
    });
    const netPrice = Number(pricingLesson.getNetPrice());
    const total = this.resolvePrivateLessonTotal(
      newLesson,
      oldPrivate.total,
      netPrice,
      isDurationChanged,
    );
    const affectedPaymentIds = await this.repository.trimPrivateLessonOverpayment(
      oldLessonId,
      enrolmentId,
      total,
      queryRunner,
    );
    if (affectedPaymentIds.length > 0) {
      await this.repository.recalculatePaymentBalances(affectedPaymentIds, queryRunner);
    }

    const paidAmount = await this.repository.getTotalPaidForPrivateLesson(
      oldLessonId,
      enrolmentId,
      queryRunner,
    );
    const balanceAmount = RoundingUtils.roundDecimal(total - paidAmount, 2);
    this.logger.log(
      `[EDIT_SCHEDULE_DEBUG] private-copy oldLessonId=${oldLessonId} newLessonId=${newLessonId} incomingExpiry=${updateDto.expiryDate ?? 'null'} parsedExpiry=${parsedExpiryDate?.toISOString?.() ?? 'null'} oldExpiry=${oldPrivate.expiryDate?.toISOString?.() ?? oldPrivate.expiryDate}`,
    );

    // Create new private lesson
    const newPrivate = queryRunner.manager.create(PrivateLesson, {
      lessonId: newLessonId,
      expiryDate: resolvedExpiryDate,
      total,
      balance: balanceAmount,
      dueDate: oldPrivate.expiryDate || new Date(),
      createdByUserId: newLesson.createdByUserId,
      updatedByUserId: newLesson.updatedByUserId,
    });

    await queryRunner.manager.save(PrivateLesson, newPrivate);
    if (rootPrivateLessonContext?.lessonId) {
      await this.repository.updatePrivateLessonExpiryDate(
        rootPrivateLessonContext.lessonId,
        resolvedExpiryDate,
        queryRunner,
      );
    }

    await this.repository.updateCourseDates(newLesson.courseId, queryRunner);
  }

  /**
   * Legacy parity for unscheduled edit:
   * PrivateLesson::beforeSave() recalculates total/balance from lesson netPrice
   * and applied non-credit-used lesson payments.
   */
  private async recalculatePrivateLessonTotalsForUnscheduledEdit(
    lesson: Lesson,
    newDuration: string,
    queryRunner: any,
  ): Promise<void> {
    const privateLesson = await this.repository.findPrivateLessonByLessonId(
      lesson.id,
      queryRunner,
    );
    if (!privateLesson) {
      return;
    }

    const pricingLesson = queryRunner.manager.create(Lesson, {
      programRate: lesson.programRate,
      tax: lesson.tax,
      duration: newDuration,
      discounts: lesson.discounts ?? [],
      course: lesson.course,
    });

    const netPrice = Number(pricingLesson.getNetPrice());
    const isDurationChanged =
      this.parseDurationToSeconds(newDuration) !==
      this.parseDurationToSeconds(String(lesson.duration ?? ''));
    const activeEnrolment = lesson.course?.enrolments?.find(
      (enrolment) =>
        Number(enrolment?.isConfirmed ?? 0) === 1 &&
        !Boolean(enrolment?.isDeleted),
    );
    const enrolmentId = activeEnrolment?.id;
    const roundedTotal = this.resolvePrivateLessonTotal(
      lesson,
      privateLesson.total,
      netPrice,
      isDurationChanged,
    );
    const affectedPaymentIds = await this.repository.trimPrivateLessonOverpayment(
      lesson.id,
      enrolmentId,
      roundedTotal,
      queryRunner,
    );
    if (affectedPaymentIds.length > 0) {
      await this.repository.recalculatePaymentBalances(affectedPaymentIds, queryRunner);
    }
    const totalPaid = await this.repository.getTotalPaidForPrivateLesson(
      lesson.id,
      enrolmentId,
      queryRunner,
    );
    const roundedBalance = RoundingUtils.roundDecimal(roundedTotal - totalPaid, 2);
    await this.repository.updatePrivateLessonTotals(
      privateLesson.id,
      roundedTotal,
      roundedBalance,
      queryRunner,
    );

    const currentExpiryDate = lesson.privateLesson?.[0]?.expiryDate
      ? new Date(lesson.privateLesson[0].expiryDate)
      : null;
    if (currentExpiryDate) {
      const rootPrivateLessonContext = await this.repository.getRootPrivateLessonContext(
        lesson.id,
        queryRunner,
      );
      if (rootPrivateLessonContext?.lessonId) {
        await this.repository.updatePrivateLessonExpiryDate(
          rootPrivateLessonContext.lessonId,
          currentExpiryDate,
          queryRunner,
        );
      }
    }

    this.logger.log(
      `[EDIT_SCHEDULE_DEBUG] unschedule-private-total-recalc lessonId=${lesson.id} enrolmentId=${enrolmentId ?? 'null'} total=${roundedTotal} paid=${totalPaid} balance=${roundedBalance}`,
    );
  }

  /**
   * Exploded private lessons keep the cent-safe total created by explode only
   * when pricing inputs are unchanged. Duration edits must recalculate from the
   * new duration, matching legacy PrivateLesson::beforeSave().
   */
  private resolvePrivateLessonTotal(
    lesson: Pick<Lesson, 'isExploded' | 'total'>,
    storedPrivateTotal: number | string | null | undefined,
    fallbackNetPrice: number,
    isDurationChanged: boolean,
  ): number {
    const isExploded = Number(lesson.isExploded ?? 0) === 1;
    const storedTotal = Number(storedPrivateTotal ?? lesson.total ?? NaN);

    if (!isDurationChanged && isExploded && Number.isFinite(storedTotal)) {
      return RoundingUtils.roundDecimal(storedTotal, 2);
    }

    return RoundingUtils.roundDecimal(fallbackNetPrice, 2);
  }

  private collectAffectedCustomerIds(lesson: Lesson): number[] {
    const ids = new Set<number>();
    for (const enrolment of lesson?.course?.enrolments || []) {
      const customerId = enrolment?.student?.user?.id;
      if (customerId) {
        ids.add(Number(customerId));
      }
    }
    return Array.from(ids);
  }

  private async recalculateCustomerBalancesStrict(
    customerIds: number[],
    locationSlug: string,
    updatedByUserId: number,
    queryRunner: any,
  ): Promise<void> {
    for (const customerId of customerIds) {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        customerId,
        {
          manager: queryRunner.manager,
          locationSlug,
          updatedByUserId,
        },
      );
    }
  }

  /**
   * Handle group lesson data copying during schedule edit
   * Legacy identical: copies group_lesson for each enrolment, recalculates total/balance
   */
  private async handleGroupLessonData(
    oldLessonId: number,
    newLessonId: number,
    queryRunner: any,
  ): Promise<void> {
    const oldGroupLessons = await queryRunner.manager.find(GroupLesson, {
      where: { lessonId: oldLessonId, isDeleted: false },
    });
    const oldDueDate = oldGroupLessons[0]?.dueDate || new Date();

    // Copy discounts
    await this.repository.copyDiscounts(oldLessonId, newLessonId, queryRunner);

    // Reload new lesson with discounts and enrolments for calculation
    const newLesson = await queryRunner.manager.findOne(Lesson, {
      where: { id: newLessonId },
      relations: [
        'discounts',
        'course',
        'course.enrolments',
        'course.enrolments.student',
      ],
    });

    if (!newLesson) {
      throw new Error('New lesson not found after copying discounts');
    }

    // Legacy parity: create rows from all confirmed + non-deleted enrolments.
    const activeEnrolments = await queryRunner.manager.find(Enrolment, {
      where: {
        courseId: newLesson.courseId,
        isDeleted: false,
        isConfirmed: 1,
      },
    });

    for (const enrolment of activeEnrolments) {
      if (!enrolment) continue;

      // Group lessons use per-session pricing; duration should not change the price.
      const grossPrice = Number(newLesson.programRate ?? 0);
      const discount = this.getGroupLessonDiscountForEnrolment(
        newLesson,
        enrolment.id,
      );
      const subTotal = grossPrice - discount;
      const total = subTotal + Number(newLesson.tax);

      // Payments are still attached to the old lesson until after group rows are recreated.
      // Use the old lesson to preserve the original paid/owing state during reschedule.
      const creditApplied = await this.repository.getCreditApplied(
        oldLessonId,
        enrolment.id,
        queryRunner,
      );
      const balance = RoundingUtils.roundDecimal(total - creditApplied, 2);

      // Create new group lesson
      const newGroupLesson = queryRunner.manager.create(GroupLesson, {
        lessonId: newLessonId,
        enrolmentId: enrolment.id,
        total: RoundingUtils.roundDecimal(total, 2),
        balance: balance,
        paidStatus: this.calculatePaidStatus(balance),
        isDeleted: false,
        dueDate: oldDueDate,
        createdByUserId: newLesson.createdByUserId,
        updatedByUserId: newLesson.updatedByUserId,
      });

      await queryRunner.manager.save(GroupLesson, newGroupLesson);
    }

    await this.repository.updateCourseDates(newLesson.courseId, queryRunner);
  }

  private async getTeacherRateForProgram(
    teacherId: number,
    programId: number | undefined,
    queryRunner: any,
  ): Promise<number> {
    if (!programId) {
      return 0;
    }

    const qualification = await queryRunner.manager.findOne(Qualification, {
      where: {
        teacherId,
        programId,
        isDeleted: false,
      },
    });
    return Number(qualification?.rate ?? 0);
  }

  private async transferLessonPaymentsWithCreditReferences(
    oldLessonId: number,
    newLessonId: number,
    queryRunner: any,
  ): Promise<void> {
    const [oldLesson, newLesson] = await Promise.all([
      queryRunner.manager.findOne(Lesson, {
        where: { id: oldLessonId },
        relations: ['course', 'course.program'],
      }),
      queryRunner.manager.findOne(Lesson, {
        where: { id: newLessonId },
        relations: ['course', 'course.program'],
      }),
    ]);

    if (
      oldLesson?.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM
      && newLesson
    ) {
      await this.privateLessonHelper.handlePrivateLessonReschedule(
        oldLesson,
        newLesson,
        queryRunner.manager,
      );
    }

    const lessonPayments = await queryRunner.manager.find(LessonPayment, {
      where: { lessonId: oldLessonId, isDeleted: false },
      relations: ['payment'],
    });

    if (lessonPayments.length === 0) {
      return;
    }

    const paymentRepo = queryRunner.manager.getRepository(Payment);
    const creditUsageRepo = queryRunner.manager.getRepository(CreditUsage);
    const newLessonRef = `L-${newLessonId.toString().padStart(6, '0')}`;

    for (const lessonPayment of lessonPayments) {
      lessonPayment.lessonId = newLessonId;
      await queryRunner.manager.save(LessonPayment, lessonPayment);

      const paymentId = lessonPayment.payment?.id;
      if (!paymentId) {
        continue;
      }

      const creditUsage = await creditUsageRepo.findOne({
        where: { creditPaymentId: paymentId },
      });

      if (!creditUsage?.debitPaymentId) {
        continue;
      }

      const debitPayment = await paymentRepo.findOne({
        where: { id: creditUsage.debitPaymentId },
      });
      if (!debitPayment) {
        continue;
      }

      debitPayment.reference = newLessonRef;
      await paymentRepo.save(debitPayment);
    }
  }

  private resolveLegacyPrivateLessonExpiryDate(
    newLessonDate: Date,
    rootExpiryDate: Date | null | undefined,
  ): Date {
    if (rootExpiryDate) {
      const nextExpiry = new Date(rootExpiryDate);
      if (newLessonDate >= nextExpiry) {
        const extendedExpiry = new Date(newLessonDate);
        extendedExpiry.setDate(extendedExpiry.getDate() + 1);
        return extendedExpiry;
      }
      return nextExpiry;
    }

    const expiryDate = new Date(newLessonDate);
    expiryDate.setDate(expiryDate.getDate() + 90);
    return expiryDate;
  }

  /**
   * Get discount for a specific enrolment (group lessons)
   */
  private getGroupLessonDiscountForEnrolment(
    lesson: Lesson,
    enrolmentId: number,
  ): number {
    const groupDiscount = lesson.discounts?.find(
      (d) => d.type === LessonDiscount.TYPE_GROUP && d.enrolmentId === enrolmentId,
    );

    if (!groupDiscount) {
      return 0;
    }

    const grossPrice = Number(lesson.programRate ?? 0);
    const discountValue = Number(groupDiscount.value ?? 0);

    if (groupDiscount.valueType) {
      return (discountValue / 100) * grossPrice;
    }

    return grossPrice < 0 ? 0 : discountValue;
  }

  /**
   * Calculate paid status based on balance
   */
  private calculatePaidStatus(balance: number): number {
    if (balance < -0.01) return 3; // CREDIT
    if (balance > 0.01) return 1; // OWING
    return 2; // PAID
  }

  /**
   * Parse duration to minutes
   */
  private parseDurationToMinutes(duration: string): number {
    const [hours, minutes, seconds] = duration.split(':').map(Number);
    return hours * 60 + minutes + Math.ceil(seconds / 60);
  }

  private parseDurationToSeconds(duration: string): number {
    const [hours = 0, minutes = 0, seconds = 0] = duration.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Normalize lesson color persistence using the legacy lesson-type default
   * color rule.
   */
  private normalizeLessonColorCode(
    lesson: Lesson,
    colorCode: string | null | undefined,
    colorLookup: Record<string, string>,
  ): string | null {
    if (!colorCode) {
      return null;
    }

    let cssClass: string | null = null;
    if (lesson.status === LessonStatusEnum.RESCHEDULED) {
      cssClass = 'lesson-rescheduled';
    } else if (lesson.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM) {
      cssClass = 'private-lesson';
    } else if (lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM) {
      cssClass = 'group-lesson';
    }

    if (!cssClass) {
      return colorCode;
    }

    const defaultColorCode = colorLookup[cssClass];
    if (defaultColorCode?.toLowerCase() === colorCode.toLowerCase()) {
      return null;
    }

    return colorCode;
  }

  /**
   * Get class name for calendar event
   */
  private getClassName(
    lesson: Lesson,
    originalTeacherId: number,
    lessonStatus: number,
  ): string {
    if (lesson.colorCode) return '';
    if (!lesson.isPresent) return 'absent-lesson';

    // Check if lesson has a root lesson (rescheduled lesson logic)
    if (lesson.originalDate && !lesson.colorCode) {
      if (!lesson.isPresent) {
        return 'absent-lesson';
      } else if (lessonStatus === LessonStatusEnum.RESCHEDULED) {
        return 'lesson-rescheduled';
      } else if (originalTeacherId !== lesson.teacherId) {
        return 'teacher-substituted';
      }
    }

    // First lesson check
    if (lesson.type !== 2 && lesson.course?.lessons?.length) {
      const firstLesson = lesson.course.lessons.reduce(
        (min, l) => (l.date < min.date ? l : min),
        lesson.course.lessons[0],
      );
      if (firstLesson && firstLesson.id === lesson.id) return 'first-lesson';
    }

    const programType = lesson.course?.program?.type;
    if (programType === ProgramTypeEnum.PRIVATE_PROGRAM) return 'private-lesson';
    if (programType === ProgramTypeEnum.GROUP_PROGRAM) return 'group-lesson';
    return '';
  }

  /**
   * Get lesson title for display
   */
  private getLessonTitle(enrolment: any): string {
    if (!enrolment) return 'Lesson';
    const studentName = enrolment.student?.user?.firstname
      ? `${enrolment.student.user.firstname} ${enrolment.student.user.lastname || ''}`.trim()
      : 'Student';
    return `${studentName} - ${enrolment.course?.program?.name || 'Lesson'}`;
  }

  /**
   * Get lesson description for tooltip
   */
  private getLessonDescription(
    lesson: Lesson,
    enrolment: any,
  ): { name: string; value: string }[] {
    const tooltip: { name: string; value: string }[] = [];

    if (lesson.course?.program) {
      // Instructors read this tooltip, so it shows the public name.
      tooltip.push({
        name: 'Program',
        value: publicProgramName(lesson.course.program, lesson.course.locationId) ?? '',
      });
    }

    if (lesson.teacher?.profile) {
      tooltip.push({
        name: 'Teacher',
        value:
          `${lesson.teacher.profile.firstname} ${lesson.teacher.profile.lastname || ''}`.trim(),
      });
    }

    if (lesson.classroom) {
      tooltip.push({ name: 'Classroom', value: lesson.classroom.name });
    }

    return tooltip;
  }
}
