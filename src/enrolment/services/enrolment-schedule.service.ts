import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, In, EntityManager } from 'typeorm';
import { EnrolmentScheduleDataDto } from '../dto/enrolment-schedule-response.dto';
import { EnrolmentScheduleHistoryDataDto } from '../dto/enrolment-schedule-history-response.dto';
import { EnrolmentScheduleRepository } from '../repositories/enrolment-schedule.repository';
import { EnrolmentScheduleTransformationService } from './transformations/enrolment-schedule-transformation.service';
import { AdjustEndDatePreviewDataDto, PreviewItemDto } from '../dto/adjust-end-date-response.dto';
import { Enrolment } from '../entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { PrivateLessonEmailStatus } from '../../lesson/entities/private-lesson-email-status.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { EnrolmentDiscount } from '../entities/enrolment-discount.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { RoundingUtils } from '../../utils/rounding.utils';
import { calculatePaymentCycleDueDate } from '../../payment/utils/payment-cycle-due-date.util';
// Date formatting helper
const formatDate = (date: Date, format: string): string => {
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (format === 'MMM dd, yyyy') {
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
  }
  return d.toISOString().split('T')[0];
};
import { EnrolmentPaymentFrequencyService } from './enrolment-payment-frequency.service';
import { EnrolmentPaymentFrequencyRepository } from '../repositories/enrolment-payment-frequency.repository';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { NotificationEmailType } from '../../customer/entities/notification-email-type.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { LessonHierarchy } from '../../lesson/entities/lesson-hierarchy.entity';
import { PaymentCycleLesson } from '../entities/payment-cycle-lesson.entity';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoicePayment } from '../../invoice/entities/invoice-payment.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { CourseRateResolverService } from '../../pricing/services/course-rate-resolver.service';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { LessonPayment } from '../../payment/entities/lesson-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Program } from '../../program/entities/program.entity';
import { Location } from '../../location/entities/location.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import {
  parseLocalDateTime,
  getCurrentESTDate,
  isProfessionalDevelopmentDay,
} from '../../utils/date-utils';
import { prepaidReduction } from '../../lesson/utils/prepaid-reduction';

@Injectable()
export class EnrolmentScheduleService {
  constructor(
    private readonly enrolmentScheduleRepository: EnrolmentScheduleRepository,
    private readonly enrolmentScheduleTransformationService: EnrolmentScheduleTransformationService,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(PaymentCycle)
    private readonly paymentCycleRepository: Repository<PaymentCycle>,
    @InjectRepository(PrivateLessonEmailStatus)
    private readonly privateLessonEmailStatusRepository: Repository<PrivateLessonEmailStatus>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(EnrolmentDiscount)
    private readonly enrolmentDiscountRepository: Repository<EnrolmentDiscount>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(NotificationEmailType)
    private readonly notificationEmailTypeRepository: Repository<NotificationEmailType>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(PaymentCycleLesson)
    private readonly paymentCycleLessonRepository: Repository<PaymentCycleLesson>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(InvoiceItemLesson)
    private readonly invoiceItemLessonRepository: Repository<InvoiceItemLesson>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepository: Repository<InvoicePayment>,
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(CustomerDiscount)
    private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAuthAssignmentRepository: Repository<RbacAuthAssignment>,
    private readonly enrolmentPaymentFrequencyService: EnrolmentPaymentFrequencyService,
    private readonly enrolmentPaymentFrequencyRepository: EnrolmentPaymentFrequencyRepository,
    // Keep new dependencies at the end: this service is constructed
    // positionally in enrolment-schedule.service.spec.ts, so a new parameter
    // anywhere earlier silently shifts every existing dependency.
    private readonly courseRateResolver: CourseRateResolverService,
  ) {}

  /**
   * Get  schedule for an enrolment
   */
  async getEnrolmentSchedule(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentScheduleDataDto> {
    try {
      const scheduleInfo = await this.enrolmentScheduleRepository.getEnrolmentScheduleById(
        enrolmentId,
        locationId,
      );

      if (!scheduleInfo) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Transform enrolment to schedule DTO
      return this.enrolmentScheduleTransformationService.transformEnrolmentScheduleData(scheduleInfo);
    } catch (error) {
      console.error('Error in getEnrolmentSchedule service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve enrolment schedule: ${error.message}`);
    }
  }

  /**
   * Get schedule history for an enrolment
   */
  async getScheduleHistory(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentScheduleHistoryDataDto> {
    try {
      const schedules = await this.enrolmentScheduleRepository.getScheduleHistory(
        enrolmentId,
        locationId,
      );

      // Transform schedules to history DTO
      return this.enrolmentScheduleTransformationService.transformScheduleHistoryData(schedules);
    } catch (error) {
      console.error('Error in getScheduleHistory service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve schedule history: ${error.message}`);
    }
  }

  /**
   * Get preview of what will be affected when adjusting end date (PRIVATE ENROLMENTS ONLY)
   * Matches legacy: EnrolmentController::actionEditEndDate() preview logic
   */
  async getAdjustEndDatePreview(
    locationId: number,
    enrolmentId: number,
    newEndDate: string,
  ): Promise<AdjustEndDatePreviewDataDto> {
    try {
      // Get enrolment with course and program
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify course belongs to location and is private
      if (enrolment.course.locationId !== locationId) {
        throw new BadRequestException('Enrolment does not belong to this location');
      }

      if (enrolment.course.type !== Course.TYPE_REGULAR) {
        throw new BadRequestException('End date adjustment is only available for private courses');
      }

      // Get last lesson for private enrolments
      // Matches legacy: lastLesson relation filters by status IN (1, 2, 5)
      // STATUS_RESCHEDULED = 1, STATUS_SCHEDULED = 2, STATUS_UNSCHEDULED = 5
      const lastLesson = await this.lessonRepository.findOne({
        where: {
          courseId: enrolment.courseId,
          isDeleted: false,
          isConfirmed: true,
          status: In([
            LessonStatusEnum.RESCHEDULED, // 1
            LessonStatusEnum.SCHEDULED,    // 2
            LessonStatusEnum.UNSCHEDULED,  // 5
          ]),
        },
        order: { date: 'DESC' },
      });

      if (!lastLesson) {
        throw new BadRequestException(
          'There are no lessons in the enrolment so end date cannot be adjusted.',
        );
      }

      const lastLessonDate = new Date(lastLesson.date);
      const newEndDateObj = new Date(newEndDate + 'T23:59:59');

      const previewItems: PreviewItemDto[] = [];
      let action: 'shrink' | 'extend' | null = null;
      let dateRange: string | null = null;

      if (lastLessonDate > newEndDateObj) {
        // SHRINK: New end date is before last lesson date
        action = 'shrink';
        dateRange = `${formatDate(newEndDateObj, 'MMM dd, yyyy')} - ${formatDate(lastLessonDate, 'MMM dd, yyyy')}`;
        previewItems.push({
          objects: 'Lessons',
          action: 'will be deleted',
          date_range: `within ${dateRange}`,
        });
        previewItems.push({
          objects: 'PFIs',
          action: 'will be deleted',
          date_range: `within ${dateRange}`,
        });
      } else if (lastLessonDate < newEndDateObj) {
        // EXTEND: New end date is after last lesson date
        action = 'extend';
        dateRange = `${formatDate(lastLessonDate, 'MMM dd, yyyy')} - ${formatDate(newEndDateObj, 'MMM dd, yyyy')}`;
        previewItems.push({
          objects: 'Lessons',
          action: 'will be created',
          date_range: `within ${dateRange}`,
        });
      }

      return {
        action,
        dateRange,
        previewItems,
      };
    } catch (error) {
      console.error('Error in getAdjustEndDatePreview service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to generate preview: ${error.message}`);
    }
  }

  /**
   * Get preview of what will be affected when adjusting group enrolment end date
   * Matches legacy: GroupEnrolmentController::actionEditEndDate() preview logic
   */
  async getGroupAdjustEndDatePreview(
    locationId: number,
    enrolmentId: number,
    newEndDate: string,
  ): Promise<AdjustEndDatePreviewDataDto> {
    try {
      // Get enrolment with course and program
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify course belongs to location and is group
      if (enrolment.course.locationId !== locationId) {
        throw new BadRequestException('Enrolment does not belong to this location');
      }

      if (enrolment.course.program?.type !== Program.TYPE_GROUP_PROGRAM) {
        throw new BadRequestException('End date adjustment is only available for group courses');
      }

      // For group enrolments, use lastRootLesson (isExploded = 0)
      // Matches legacy: filters by status IN (1, 2, 5) for group lessons
      const lastLesson = await this.lessonRepository.findOne({
        where: {
          courseId: enrolment.courseId,
          isDeleted: false,
          isConfirmed: true,
          status: In([
            LessonStatusEnum.RESCHEDULED, // 1
            LessonStatusEnum.SCHEDULED,    // 2
            LessonStatusEnum.UNSCHEDULED,  // 5
          ]),
          isExploded: 0, // Root lesson only
        },
        order: { date: 'DESC' },
      });

      if (!lastLesson) {
        throw new BadRequestException(
          'There are no lessons in the enrolment so end date cannot be adjusted.',
        );
      }

      const lastLessonDate = new Date(lastLesson.date);
      const newEndDateObj = new Date(newEndDate + 'T23:59:59');

      // For group enrolments: validate that new end date <= current end date (can only shrink)
      if (newEndDateObj > lastLessonDate) {
        throw new BadRequestException("You can't extend group enrolments");
      }

      const previewItems: PreviewItemDto[] = [];
      let action: 'shrink' | 'extend' | null = null;
      let dateRange: string | null = null;

      if (lastLessonDate > newEndDateObj) {
        // SHRINK: New end date is before last lesson date
        action = 'shrink';
        dateRange = `${formatDate(newEndDateObj, 'MMM dd, yyyy')} - ${formatDate(lastLessonDate, 'MMM dd, yyyy')}`;
        previewItems.push({
          objects: 'Lessons',
          action: 'will be deleted',
          date_range: `within ${dateRange}`,
        });
        previewItems.push({
          objects: 'PFIs',
          action: 'will be deleted',
          date_range: `within ${dateRange}`,
        });
      }

      return {
        action,
        dateRange,
        previewItems,
      };
    } catch (error) {
      console.error('Error in getGroupAdjustEndDatePreview service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to generate preview: ${error.message}`);
    }
  }

  /**
   * Adjust enrolment end date (shrink or extend) - PRIVATE ENROLMENTS ONLY
   * Matches legacy: EnrolmentController::actionEditEndDate() POST logic
   */
  async adjustEndDate(
    locationId: number,
    enrolmentId: number,
    newEndDate: string,
    loggedUserId: number,
  ): Promise<{ message: string }> {
    try {
      // Get enrolment with course and program
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program', 'paymentFrequency'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify course belongs to location
      if (enrolment.course.locationId !== locationId) {
        throw new BadRequestException('Enrolment does not belong to this location');
      }

      const isGroupEnrolment = enrolment.course.program?.type === Program.TYPE_GROUP_PROGRAM;
      const isPrivateEnrolment = enrolment.course.type === Course.TYPE_REGULAR;

      if (!isGroupEnrolment && !isPrivateEnrolment) {
        throw new BadRequestException('End date adjustment is only available for private or group courses');
      }

      // For group enrolments, use lastRootLesson (isExploded = 0)
      // For private enrolments, use lastLesson
      let lastLesson: Lesson | null = null;
      if (isGroupEnrolment) {
        lastLesson = await this.lessonRepository.findOne({
          where: {
            courseId: enrolment.courseId,
            isDeleted: false,
            isConfirmed: true,
            status: Not(LessonStatusEnum.CANCELED),
            isExploded: 0, // Root lesson only
          },
          order: { date: 'DESC' },
        });
      } else {
        lastLesson = await this.lessonRepository.findOne({
          where: {
            courseId: enrolment.courseId,
            isDeleted: false,
            isConfirmed: true,
            status: Not(LessonStatusEnum.CANCELED),
          },
          order: { date: 'DESC' },
        });
      }

      if (!lastLesson) {
        throw new BadRequestException(
          'There are no lessons in the enrolment so end date cannot be adjusted.',
        );
      }

      const lastLessonDate = new Date(lastLesson.date);
      const newEndDateObj = new Date(newEndDate + 'T23:59:59');

      // Update course end date
      await this.courseRepository.update(enrolment.courseId, {
        endDate: newEndDateObj,
        updatedByUserId: loggedUserId,
      });

      // Update enrolment endDateTime
      await this.enrolmentRepository.update(enrolmentId, {
        endDateTime: newEndDateObj,
        updatedByUserId: loggedUserId,
      });

      // Determine action and execute
      if (lastLessonDate > newEndDateObj) {
        await this.shrinkEnrolment(enrolment, newEndDateObj, loggedUserId);
      } else if (lastLessonDate < newEndDateObj) {
        await this.extendEnrolment(enrolment, lastLesson, newEndDateObj, loggedUserId);
      }

      // Update course dates based on actual lessons
      await this.updateCourseDates(enrolment.courseId);

      return {
        message: 'Enrolment end date successfully updated!',
      };
    } catch (error) {
      console.error('Error in adjustEndDate service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to adjust end date: ${error.message}`);
    }
  }

  /**
   * Adjust group enrolment end date (shrink only)
   * Matches legacy: GroupEnrolmentController::actionEditEndDate() POST logic
   */
  async adjustGroupEndDate(
    locationId: number,
    enrolmentId: number,
    newEndDate: string,
    loggedUserId: number,
  ): Promise<{ message: string }> {
    try {
      // Get enrolment with course and program
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify course belongs to location and is group
      if (enrolment.course.locationId !== locationId) {
        throw new BadRequestException('Enrolment does not belong to this location');
      }

      if (enrolment.course.program?.type !== Program.TYPE_GROUP_PROGRAM) {
        throw new BadRequestException('End date adjustment is only available for group courses');
      }

      // For group enrolments, use lastRootLesson (isExploded = 0)
      const lastLesson = await this.lessonRepository.findOne({
        where: {
          courseId: enrolment.courseId,
          isDeleted: false,
          isConfirmed: true,
          status: Not(LessonStatusEnum.CANCELED),
          isExploded: 0, // Root lesson only
        },
        order: { date: 'DESC' },
      });

      if (!lastLesson) {
        throw new BadRequestException(
          'There are no lessons in the enrolment so end date cannot be adjusted.',
        );
      }

      const lastLessonDate = new Date(lastLesson.date);
      const newEndDateObj = new Date(newEndDate + 'T23:59:59');

      // For group enrolments: validate that new end date <= current end date (can only shrink)
      if (newEndDateObj > lastLessonDate) {
        throw new BadRequestException("You can't extend group enrolments");
      }

      // Update enrolment endDateTime (matching legacy: $model->endDateTime = Carbon::parse($courseEndDate)->format('Y-m-d'))
      await this.enrolmentRepository.update(enrolmentId, {
        endDateTime: newEndDateObj,
        updatedByUserId: loggedUserId,
      });

      // SHRINK only (group enrolments can't extend)
      if (lastLessonDate > newEndDateObj) {
        await this.shrinkGroupEnrolment(enrolment, newEndDateObj, loggedUserId);
      }

      // Update student and user status (matching legacy: $model->setStatus())
      await this.updateStudentAndUserStatus(enrolment);

      // Get student for message (matching legacy: $model->customer->publicIdentity)
      const student = await this.studentRepository.findOne({
        where: { id: enrolment.studentId },
        relations: ['user'],
      });
      const customerName = student?.user?.username || 'customer';
      const message = `Lesson credits has been credited to ${customerName} account.`;

      return { message };
    } catch (error) {
      console.error('Error in adjustGroupEndDate service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to adjust end date: ${error.message}`);
    }
  }

  /**
   * Shrink enrolment - delete lessons after new end date, add credit invoices, reset payment cycles
   * Matches legacy: Enrolment::shrink()
   */
  private async shrinkEnrolment(
    enrolment: Enrolment,
    newEndDate: Date,
    loggedUserId: number,
  ): Promise<void> {
    // 1. Add credit invoice for lessons after new end date
    await this.addCreditInvoice(enrolment, newEndDate, loggedUserId);

    // 2. Disable auto-renew
    await this.enrolmentRepository.update(enrolment.id, {
      isAutoRenew: 0,
      updatedByUserId: loggedUserId,
    });

    // 3. Reset payment cycles (will be recalculated based on new end date)
    // Get the enrolment payment frequency or use default
    const paymentFrequency = await this.paymentFrequencyRepository.findOne({
      where: { id: enrolment.paymentFrequencyId },
    });

    if (paymentFrequency) {
      // Use the payment frequency service to reset cycles
      // We need to get the effective date (first unpaid payment cycle start date or course start date)
      const firstUnpaidCycle = await this.paymentCycleRepository.findOne({
        where: {
          enrolmentId: enrolment.id,
          isDeleted: 0,
        },
        order: { startDate: 'ASC' },
      });

      const effectiveDate = firstUnpaidCycle
        ? new Date(firstUnpaidCycle.startDate)
        : new Date(enrolment.course.startDate);

      // Reset payment cycles using the payment frequency service logic
      await this.resetPaymentCyclesForShrink(enrolment, effectiveDate, paymentFrequency);
    }
  }

  /**
   * Extend enrolment - create lessons, create course schedule, apply discounts, reset payment cycles
   * Matches legacy: Enrolment::extend()
   */
  private async extendEnrolment(
    enrolment: Enrolment,
    lastLesson: Lesson,
    newEndDate: Date,
    loggedUserId: number,
  ): Promise<void> {
    // 1. Get recent course schedule
    const recentSchedule = await this.courseScheduleRepository.findOne({
      where: { courseId: enrolment.courseId },
      order: { id: 'DESC' },
    });

    if (!recentSchedule) {
      throw new BadRequestException('No course schedule found for enrolment');
    }

    // 2. Generate lessons from day after last lesson to new end date
    const extensionStartDate = new Date(lastLesson.date);
    extensionStartDate.setDate(extensionStartDate.getDate() + 1);

    // 2a. Restore lessons that were soft-deleted by a previous shrink so the
    // extension reuses the existing paid/unpaid rows instead of rebuilding them.
    const restoredLessonDueDates = await this.restoreDeletedLessonsForExtension(
      enrolment,
      extensionStartDate,
      newEndDate,
      loggedUserId,
    );

    await this.generateLessons(
      enrolment,
      lastLesson,
      newEndDate,
      recentSchedule,
      loggedUserId,
    );

    // 2b. Reconcile any lessons that already exist in the extension window.
    // This keeps the earliest active lesson as canonical and moves payments
    // / payment-cycle links away from duplicate or replaced rows.
    await this.reconcileExtendedLessons(
      enrolment,
      extensionStartDate,
      newEndDate,
      loggedUserId,
    );

    // 3. Create new course schedule for extended period
    const scheduleStartDate = new Date(recentSchedule.endDate);
    scheduleStartDate.setDate(scheduleStartDate.getDate() + 1); // +1 day

    // A payment-cycle schedule can already cover the requested lesson extension.
    // Only append history when there is an uncovered calendar day.
    scheduleStartDate.setHours(0, 0, 0, 0);
    if (scheduleStartDate <= newEndDate) {
      const newSchedule = this.courseScheduleRepository.create({
        courseId: enrolment.courseId,
        startDate: scheduleStartDate,
        endDate: newEndDate,
        teacherId: recentSchedule.teacherId,
        day: recentSchedule.day,
        fromTime: recentSchedule.fromTime,
        duration: recentSchedule.duration,
        isRecent: true,
      });

      // Mark all old schedules as not recent (matching legacy: queries 199-201)
      await this.courseScheduleRepository
        .createQueryBuilder()
        .update(CourseSchedule)
        .set({ isRecent: false })
        .where('courseId = :courseId', { courseId: enrolment.courseId })
        .execute();

      await this.courseScheduleRepository.save(newSchedule);
    }

    // 4. Reset payment cycles for extended period
    const paymentFrequency = await this.paymentFrequencyRepository.findOne({
      where: { id: enrolment.paymentFrequencyId },
    });

    if (paymentFrequency) {
      const effectiveDate = new Date(lastLesson.date);
      await this.resetPaymentCyclesForExtend(enrolment, effectiveDate, paymentFrequency, newEndDate);
    }

    // 5. Link new lessons to payment cycles and set due dates
    const newLessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('DATE(lesson.date) BETWEEN :startDate AND :endDate', {
        startDate: this.formatDateOnly(extensionStartDate),
        endDate: this.formatDateOnly(newEndDate),
      })
      .getMany();
    await this.linkLessonsToPaymentCycles(enrolment, newLessons, restoredLessonDueDates);

    // 6. Update student and user status
    await this.updateStudentAndUserStatus(enrolment);

    // 7. Update customer account balance after lessons are created
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId },
    });
    if (course) {
      await this.updateCustomerAccountBalance(enrolment, course.locationId);
    }
  }

  /**
   * Restore lessons that were soft-deleted by a previous shrink.
   * This brings back the lesson rows and their non-credit lesson payments so a
   * later extend can reuse the original active lesson instead of creating a
   * duplicate owing row.
   */
  private async restoreDeletedLessonsForExtension(
    enrolment: Enrolment,
    extensionStartDate: Date,
    newEndDate: Date,
    loggedUserId: number,
  ): Promise<Map<number, string | null>> {
    const lessonsToRestore = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: true })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status = :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('DATE(lesson.date) BETWEEN :startDate AND :endDate', {
        startDate: this.formatDateOnly(extensionStartDate),
        endDate: this.formatDateOnly(newEndDate),
      })
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.id', 'ASC')
      .getMany();

    if (lessonsToRestore.length === 0) {
      return new Map<number, string | null>();
    }

    const restoredLessonDueDates = new Map<number, string | null>();
    const paymentIdsToRecalculate = new Set<number>();

    for (const lesson of lessonsToRestore) {
      restoredLessonDueDates.set(
        lesson.id,
        lesson.dueDate ? this.formatDateOnly(lesson.dueDate) : null,
      );

      const lessonPaymentsToRestore = await this.lessonPaymentRepository.find({
        where: {
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          isDeleted: 1,
        },
        relations: ['payment'],
      });

      for (const lessonPayment of lessonPaymentsToRestore) {
        const payment = lessonPayment.payment;
        if (!payment || Number(payment.isDeleted ?? 0) === 1) {
          continue;
        }

        if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_USED) {
          continue;
        }

        await this.lessonPaymentRepository.update(lessonPayment.id, {
          isDeleted: 0,
          updatedByUserId: loggedUserId,
        });
        paymentIdsToRecalculate.add(lessonPayment.paymentId);
      }

      await this.lessonRepository.update(lesson.id, {
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
        updatedByUserId: loggedUserId,
      });

      await this.recalculatePrivateLessonBalance(lesson.id, enrolment.id);
    }

    for (const paymentId of paymentIdsToRecalculate) {
      await this.recalculatePaymentBalance(paymentId, loggedUserId);
    }

    return restoredLessonDueDates;
  }

  /**
   * Reconcile lessons that already exist in the extension window.
   * Keeps the earliest active lesson per date and moves payments / cycle links
   * from any duplicate rows onto it.
   */
  private async reconcileExtendedLessons(
    enrolment: Enrolment,
    extensionStartDate: Date,
    newEndDate: Date,
    loggedUserId: number,
  ): Promise<void> {
    const lessonsInRange = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) BETWEEN :startDate AND :endDate', {
        startDate: this.formatDateOnly(extensionStartDate),
        endDate: this.formatDateOnly(newEndDate),
      })
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.id', 'ASC')
      .getMany();

    if (lessonsInRange.length === 0) {
      return;
    }

    const lessonsByDate = new Map<string, Lesson[]>();
    for (const lesson of lessonsInRange) {
      const key = this.formatDateOnly(lesson.date);
      const lessonsForDate = lessonsByDate.get(key) ?? [];
      lessonsForDate.push(lesson);
      lessonsByDate.set(key, lessonsForDate);
    }

    for (const lessonsForDate of lessonsByDate.values()) {
      const activeLessons = lessonsForDate.filter(
        (lesson) => lesson.status !== LessonStatusEnum.CANCELED,
      );

      if (activeLessons.length === 0) {
        continue;
      }

      const canonicalLesson = activeLessons.reduce((winner, lesson) => (
        lesson.id < winner.id ? lesson : winner
      ));
      const affectedLessonIds = new Set<number>([canonicalLesson.id]);

      for (const lesson of lessonsForDate) {
        if (lesson.id === canonicalLesson.id) {
          continue;
        }

        affectedLessonIds.add(lesson.id);
        await this.moveLessonPaymentsToLesson(lesson.id, canonicalLesson.id);
        await this.movePaymentCycleLessonsToLesson(lesson.id, canonicalLesson.id);

        if (lesson.status !== LessonStatusEnum.CANCELED) {
          await this.lessonRepository.update(lesson.id, {
            status: LessonStatusEnum.CANCELED,
            updatedByUserId: loggedUserId,
          });
        }
      }

      for (const lessonId of affectedLessonIds) {
        await this.recalculatePrivateLessonBalance(lessonId, enrolment.id);
      }
    }
  }

  /**
   * Move lesson_payment rows onto the canonical lesson and keep credit references aligned.
   */
  private async moveLessonPaymentsToLesson(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    const lessonPayments = await this.lessonPaymentRepository.find({
      where: {
        lessonId: oldLessonId,
        isDeleted: 0,
      },
      select: ['id', 'paymentId'],
    });

    if (lessonPayments.length === 0) {
      return;
    }

    await this.lessonPaymentRepository.update(
      { lessonId: oldLessonId, isDeleted: 0 } as any,
      { lessonId: newLessonId },
    );

    const paymentIds = [...new Set(
      lessonPayments
        .map((lessonPayment) => Number(lessonPayment.paymentId))
        .filter((paymentId) => Number.isFinite(paymentId) && paymentId > 0),
    )];

    const lessonNumber = String(newLessonId);
    for (const paymentId of paymentIds) {
      await this.updateCreditUsageReference(paymentId, lessonNumber);
    }
  }

  /**
   * Mirror legacy LessonReschedule::save() credit reference update.
   */
  private async updateCreditUsageReference(
    paymentId: number,
    lessonNumber: string,
  ): Promise<void> {
    const creditUsage = await this.lessonRepository
      .createQueryBuilder()
      .select('cu.debit_payment_id', 'debitPaymentId')
      .from('credit_usage', 'cu')
      .where('cu.credit_payment_id = :paymentId', { paymentId })
      .getRawOne<{ debitPaymentId?: number | string }>();

    const debitPaymentId = Number(creditUsage?.debitPaymentId ?? 0);
    if (!Number.isFinite(debitPaymentId) || debitPaymentId <= 0) {
      return;
    }

    await this.paymentRepository.update(
      { id: debitPaymentId },
      { reference: lessonNumber },
    );
  }

  /**
   * Recalculate a payment balance from the currently active lesson/invoice usage.
   * Mirrors the balance recalculation used elsewhere when lesson payments change.
   */
  private async recalculatePaymentBalance(
    paymentId: number,
    loggedUserId: number,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment || Number(payment.isDeleted ?? 0) === 1) {
      return;
    }

    const lessonPayments = await this.lessonPaymentRepository.find({
      where: {
        paymentId,
        isDeleted: 0,
      },
      relations: ['payment'],
    });

    const activeLessonUsed = lessonPayments.reduce((sum, lessonPayment) => {
      const linkedPayment = lessonPayment.payment;
      if (!linkedPayment || Number(linkedPayment.isDeleted ?? 0) === 1) {
        return sum;
      }

      if (Number(linkedPayment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_USED) {
        return sum;
      }

      return sum.plus(lessonPayment.amount ?? 0);
    }, RoundingUtils.decimal(0));

    const invoicePayments = await this.invoicePaymentRepository.find({
      where: {
        paymentId,
        isDeleted: 0,
      },
      select: ['amount'],
    });

    const invoiceUsed = invoicePayments.reduce(
      (sum, invoicePayment) => sum.plus(invoicePayment.amount ?? 0),
      RoundingUtils.decimal(0),
    );

    await this.paymentRepository.update(paymentId, {
      balance: RoundingUtils.calculatePaymentBalance(
        payment.amount ?? 0,
        invoiceUsed,
        activeLessonUsed,
      ),
      updatedByUserId: loggedUserId,
    });
  }

  /**
   * Move payment-cycle links to the canonical lesson while keeping one active link per cycle.
   */
  private async movePaymentCycleLessonsToLesson(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    const oldLinks = await this.paymentCycleLessonRepository.find({
      where: {
        lessonId: oldLessonId,
        isDeleted: 0,
      },
    });

    if (oldLinks.length === 0) {
      return;
    }

    const existingCanonicalLinks = await this.paymentCycleLessonRepository.find({
      where: {
        lessonId: newLessonId,
        isDeleted: 0,
      },
    });
    const canonicalCycleIds = new Set(
      existingCanonicalLinks.map((link) => link.paymentCycleId),
    );

    for (const link of oldLinks) {
      if (canonicalCycleIds.has(link.paymentCycleId)) {
        await this.paymentCycleLessonRepository.update(link.id, { isDeleted: 1 });
        continue;
      }

      await this.paymentCycleLessonRepository.update(link.id, {
        lessonId: newLessonId,
      });
      canonicalCycleIds.add(link.paymentCycleId);
    }
  }

  /**
   * Refresh private_lesson.balance after payments are moved.
   * Mirrors the existing private lesson balance math: total - active lesson payments.
   */
  private async recalculatePrivateLessonBalance(
    lessonId: number,
    enrolmentId: number,
  ): Promise<void> {
    const privateLessons = await this.privateLessonRepository.find({
      where: { lessonId },
    });

    if (privateLessons.length === 0) {
      return;
    }

    const lessonPayments = await this.lessonPaymentRepository.find({
      where: {
        lessonId,
        enrolmentId,
        isDeleted: 0,
      },
      relations: ['payment'],
    });

    const paidAmount = lessonPayments.reduce((sum, lessonPayment) => {
      const payment = lessonPayment.payment;
      if (!payment || Number(payment.isDeleted ?? 0) === 1) {
        return sum;
      }

      if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_USED) {
        return sum;
      }

      return sum.plus(lessonPayment.amount ?? 0);
    }, RoundingUtils.decimal(0));

    for (const privateLesson of privateLessons) {
      privateLesson.balance = RoundingUtils.calculateBalance(
        privateLesson.total ?? 0,
        paidAmount,
        2,
      );
    }

    await this.privateLessonRepository.save(privateLessons);
  }

  /**
   * Normalize a date to YYYY-MM-DD for date-only comparisons.
   */
  private formatDateOnly(date: Date): string {
    return new Date(date).toISOString().split('T')[0];
  }

  /**
   * Convert duration string (HH:MM:SS) to hours (decimal)
   * Matches legacy: Lesson::getUnit() - converts duration to hours
   */
  private durationToHours(duration: string): number {
    // Duration format: "HH:MM:SS" or "HH:MM"
    const parts = duration.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    return (hours * 60 + minutes) / 60;
  }

  /**
   * Every rate period for a course, fetched once so the extension loop can
   * resolve a rate per lesson date without a query each time.
   */
  private async getCourseProgramRates(
    courseId: number,
  ): Promise<CourseProgramRate[]> {
    return this.courseProgramRateRepository.find({ where: { courseId } });
  }

  /**
   * Hourly program rate for a course on a specific date.
   *
   * Previously this fetched only the newest rate row and then compared the
   * lesson date against it in a branch that returned the same value in both
   * cases, so the date was ignored and the newest rate always won. Harmless
   * while a course had a single rate; wrong the moment a September-effective
   * row exists, because August lessons would take the September rate.
   */
  private resolveHourlyProgramRate(
    courseId: number,
    rates: CourseProgramRate[],
    date: Date,
  ): number {
    const resolved = this.courseRateResolver.selectRateForDate(
      rates,
      this.formatDateOnly(date),
    );

    if (!resolved) {
      throw new Error(`No program rate found for course ${courseId}`);
    }

    return resolved.programRate;
  }

  /**
   * Get number of weeks in a month for a specific weekday
   * Returns the count of occurrences of a weekday in a given month
   */
  private getWeeksInMonth(year: number, month: number, dayOfWeek: number): number {
    // dayOfWeek: 1=Monday, 2=Tuesday, ..., 7=Sunday
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0); // Last day of month
    
    let count = 0;
    const currentDate = new Date(firstDay);
    
    // Find first occurrence of the weekday in the month
    const firstDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
    let daysToFirst = 0;
    
    if (dayOfWeek >= firstDayOfWeek) {
      daysToFirst = dayOfWeek - firstDayOfWeek;
    } else {
      daysToFirst = (7 - firstDayOfWeek) + dayOfWeek;
    }
    
    currentDate.setDate(1 + daysToFirst);
    
    // Count all occurrences of this weekday in the month
    while (currentDate <= lastDay) {
      count++;
      currentDate.setDate(currentDate.getDate() + 7); // Move to next week
    }
    
    return count;
  }

  /**
   * Generate lessons between last lesson date and new end date
   * Matches legacy: Enrolment::generateLessons()
   * IMPORTANT: Only creates 4 lessons per month (skips 5th occurrence if month has 5 weeks)
   * Accounts for existing lessons in the month to ensure total doesn't exceed 4
   */
  private async generateLessons(
    enrolment: Enrolment,
    lastLesson: Lesson,
    newEndDate: Date,
    schedule: CourseSchedule,
    loggedUserId: number,
  ): Promise<void> {
    const startDate = new Date(lastLesson.date);
    startDate.setDate(startDate.getDate() + 1); // Day after last lesson

    const currentDate = new Date(startDate);
    const dayOfWeek = schedule.day; // 1-7 (Monday-Sunday)

    // IMPORTANT: In legacy, lesson.programRate stores the HOURLY rate, not the
    // lesson price. The lesson price is calculated later as programRate * unit.
    //
    // Rate periods are fetched once and resolved per lesson date inside the
    // loop below. Resolving a single rate for the whole extension cannot
    // express a price change part-way through the window, which is exactly
    // what 1 September 2026 is.
    const courseProgramRates = await this.getCourseProgramRates(
      enrolment.courseId,
    );

    // Count existing lessons per month to account for lessons already in the month
    // This ensures we don't exceed 4 lessons per month when extending
    const existingLessonsPerMonth = new Map<string, number>();
    
    // Get all existing lessons for this course (confirmed, not deleted, not canceled)
    const existingLessons = await this.lessonRepository.find({
      where: {
        courseId: enrolment.courseId,
        isDeleted: false,
        isConfirmed: true,
        status: Not(LessonStatusEnum.CANCELED),
      },
    });

    // Count existing lessons per month
    for (const lesson of existingLessons) {
      const lessonDate = new Date(lesson.date);
      // Use UTC methods to avoid timezone issues
      const year = lessonDate.getUTCFullYear();
      const month = lessonDate.getUTCMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      const currentCount = existingLessonsPerMonth.get(monthKey) || 0;
      existingLessonsPerMonth.set(monthKey, currentCount + 1);
    }

    const existingLessonsInRange = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) BETWEEN :startDate AND :endDate', {
        startDate: this.formatDateOnly(startDate),
        endDate: this.formatDateOnly(newEndDate),
      })
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.id', 'ASC')
      .getMany();

    const activeLessonsByDate = new Map<string, Lesson[]>();
    for (const lesson of existingLessonsInRange) {
      if (lesson.status === LessonStatusEnum.CANCELED) {
        continue;
      }

      const key = this.formatDateOnly(lesson.date);
      const lessonsForDate = activeLessonsByDate.get(key) ?? [];
      lessonsForDate.push(lesson);
      activeLessonsByDate.set(key, lessonsForDate);
    }

    const lessons: Lesson[] = [];
    
    // Track NEW lessons per month (in addition to existing ones)
    // Key: "YYYY-MM", Value: count of NEW lessons created in that month
    const newLessonsPerMonth = new Map<string, number>();

    while (currentDate <= newEndDate) {
      // Check if current date matches the scheduled day of week
      const currentDayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay(); // Convert Sunday from 0 to 7

      if (currentDayOfWeek === dayOfWeek) {
        // Get month key for tracking (YYYY-MM)
        // Use UTC methods to avoid timezone issues (consistent with existing lessons counting)
        const year = currentDate.getUTCFullYear();
        const month = currentDate.getUTCMonth();
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        
        // Get existing lesson count for this month
        const existingCount = existingLessonsPerMonth.get(monthKey) || 0;
        
        // Get new lesson count for this month
        const newCount = newLessonsPerMonth.get(monthKey) || 0;
        
        // Total lessons in this month = existing + new
        const totalCount = existingCount + newCount;
        
        // Check if month has more than 4 weeks (5 occurrences of the weekday)
        const weeksInMonth = this.getWeeksInMonth(year, month, dayOfWeek);

        const lessonsForDate = activeLessonsByDate.get(this.formatDateOnly(currentDate));
        if (lessonsForDate && lessonsForDate.length > 0) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
        
        // Only create lesson if total (existing + new) is less than 4
        // If month has 5 weeks, we'll skip the 5th occurrence (when total reaches 4)
        if (totalCount < 4) {
          // Create lesson
          // Set dueDate to the lesson date initially (will be updated later based on payment cycle)
          const lessonDate = new Date(currentDate);
          const dueDate = lessonDate.toISOString().split('T')[0]; // YYYY-MM-DD format

          const now = getCurrentESTDate();
          
          const lesson = this.lessonRepository.create({
            courseId: enrolment.courseId,
            teacherId: schedule.teacherId,
            date: lessonDate,
            duration: schedule.duration,
            status: LessonStatusEnum.SCHEDULED,
            isPresent: true, // Matching legacy: isPresent = 1
            isDeleted: false,
            isConfirmed: true,
            type: 1, // TYPE_REGULAR
            isExploded: 0,
            isOnline: enrolment.isOnline === 1,
            createdByUserId: loggedUserId,
            updatedByUserId: loggedUserId,
            programRate: this.resolveHourlyProgramRate(
              enrolment.courseId,
              courseProgramRates,
              lessonDate,
            ), // Hourly rate for THIS lesson's date (matches legacy storage)
            teacherRate: lastLesson.teacherRate,
            teacherRateOld: lastLesson.teacherRateOld,
            tax: lastLesson.tax,
            dueDate: dueDate,
            createdOn: now,
            updatedOn: now,
          });

          lessons.push(lesson);
          
          // Update count for this month
          newLessonsPerMonth.set(monthKey, newCount + 1);
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Save all lessons
    if (lessons.length > 0) {
      const savedLessons = await this.lessonRepository.save(lessons);

      // Set originalDate for each lesson (matching legacy: UPDATE lesson SET originalDate)
      for (const lesson of savedLessons) {
        await this.lessonRepository.update(lesson.id, {
          originalDate: lesson.date,
        });
      }

      // Make lessons as root (create lesson_hierarchy entries)
      await this.makeLessonsAsRoot(savedLessons);

      // Apply discounts to new lessons FIRST (before creating private_lesson)
      // Matches legacy: $extendedLesson->setDiscount() is called before private_lesson creation
      await this.applyDiscountsToLessons(enrolment, savedLessons, loggedUserId);

      // Create private_lesson records for each lesson (after discounts are applied)
      // The total will be calculated as: (programRate * unit) - discounts + tax
      await this.createPrivateLessons(savedLessons, enrolment);

      // Create email status records for new lessons
      await this.createEmailStatusRecords(savedLessons, loggedUserId);
    }
  }

  /**
   * Apply discounts to lessons based on enrolment discounts
   * Matches legacy: Lesson::setDiscount() -> addPFDiscount(), addEnrolmentDiscount()
   * OPTIMIZED: Uses bulk inserts instead of individual saves
   */
  async applyDiscountsToLessons(
    enrolment: Enrolment,
    lessons: Lesson[],
    loggedUserId: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }
    
    const enrolmentDiscountRepository = manager
      ? manager.getRepository(EnrolmentDiscount)
      : this.enrolmentDiscountRepository;
    const studentRepository = manager
      ? manager.getRepository(Student)
      : this.studentRepository;
    const customerDiscountRepository = manager
      ? manager.getRepository(CustomerDiscount)
      : this.customerDiscountRepository;
    const lessonDiscountRepository = manager
      ? manager.getRepository(LessonDiscount)
      : this.lessonDiscountRepository;

    // Get enrolment discounts upfront
    const discounts = await enrolmentDiscountRepository.find({
      where: { enrolmentId: enrolment.id },
    });

    if (discounts.length === 0) {
      return;
    }

    const MULTIPLE_ENROLMENT_DIVISOR = 4;

    // Get customer discount upfront
    const student = await studentRepository.findOne({
      where: { id: enrolment.studentId },
      relations: ['user'],
    });

    let customerDiscount: CustomerDiscount | null = null;
    const customerId = student?.user?.id;
    if (customerId) {
      customerDiscount = await customerDiscountRepository.findOne({
        where: { 
          customerId,
          isDeleted: false,
        },
      });
    }

    // Fetch all existing discounts for these lessons in one query
    const lessonIds = lessons.map(l => l.id);
    const existingDiscounts = await lessonDiscountRepository.find({
      where: lessonIds.map(lessonId => ({
        lessonId,
      })),
    });

    // Create a Set for fast lookup: "lessonId-type-enrolmentId"
    const existingDiscountKeys = new Set<string>();
    for (const ed of existingDiscounts) {
      const key = `${ed.lessonId}-${ed.type}-${ed.enrolmentId || ''}`;
      existingDiscountKeys.add(key);
    }

    // Prepare bulk inserts
    const discountInserts: any[] = [];

    for (const lesson of lessons) {
      // Apply customer discount if exists
      if (customerDiscount && customerDiscount.value !== null && customerDiscount.value !== undefined) {
        const customerKey = `${lesson.id}-1-${enrolment.id || ''}`;
        if (!existingDiscountKeys.has(customerKey)) {
          discountInserts.push({
            lessonId: lesson.id,
            type: 1, // TYPE_CUSTOMER
            value: customerDiscount.value,
            valueType: 1, // VALUE_TYPE_PERCENTAGE
            enrolmentId: enrolment.id || null,
          });
          existingDiscountKeys.add(customerKey); // Prevent duplicates in same batch
        }
      }
      
      // Apply enrolment discounts
      for (const discount of discounts) {
        if (!discount.discount) {
          continue;
        }
        
        const lessonDiscountType = this.mapEnrolmentDiscountTypeToLessonDiscountType(discount.type);
        const discountKey = `${lesson.id}-${lessonDiscountType}-${enrolment.id || ''}`;
        
        if (!existingDiscountKeys.has(discountKey)) {
          let discountValue = discount.discount;
          let discountValueType = discount.discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR ? 0 : 1;
          
          if (lessonDiscountType === 3) {
            discountValue = discount.discount / MULTIPLE_ENROLMENT_DIVISOR;
          }
          
          discountInserts.push({
            lessonId: lesson.id,
            type: lessonDiscountType,
            value: discountValue,
            valueType: discountValueType,
            enrolmentId: enrolment.id || null,
          });
          existingDiscountKeys.add(discountKey); // Prevent duplicates in same batch
        }
      }
    }

    // Bulk insert all discounts at once
    if (discountInserts.length > 0) {
      await lessonDiscountRepository
        .createQueryBuilder()
        .insert()
        .into(LessonDiscount)
        .values(discountInserts)
        .execute();
    }
  }

  /**
   * Map enrolment discount type to lesson discount type
   */
  private mapEnrolmentDiscountTypeToLessonDiscountType(
    enrolmentDiscountType: number,
  ): number {
    // EnrolmentDiscount::TYPE_PAYMENT_FREQUENCY = 1 -> LessonDiscount::TYPE_ENROLMENT_PAYMENT_FREQUENCY = 2
    // EnrolmentDiscount::TYPE_MULTIPLE_ENROLMENT = 2 -> LessonDiscount::TYPE_MULTIPLE_ENROLMENT = 3
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY) {
      return 2; // LessonDiscount::TYPE_ENROLMENT_PAYMENT_FREQUENCY
    }
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT) {
      return 3; // LessonDiscount::TYPE_MULTIPLE_ENROLMENT
    }
    return enrolmentDiscountType;
  }

  /**
   * Create email status records for lessons
   * Matches legacy: PrivateLessonEmailStatus creation in extend()
   * OPTIMIZED: Uses bulk insert instead of individual saves
   */
  private async createEmailStatusRecords(
    lessons: Lesson[],
    loggedUserId: number,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }
    
    // Get all notification email types upfront
    const notificationEmailTypes = await this.notificationEmailTypeRepository.find();

    if (notificationEmailTypes.length === 0) {
      return;
    }

    // Prepare bulk inserts
    const emailStatusInserts: any[] = [];
    for (const lesson of lessons) {
      for (const emailType of notificationEmailTypes) {
        emailStatusInserts.push({
          lessonId: lesson.id,
          notificationType: emailType.id,
          status: 0, // 0 = false
        });
      }
    }

    // Bulk insert all email status records at once
    if (emailStatusInserts.length > 0) {
      await this.privateLessonEmailStatusRepository
        .createQueryBuilder()
        .insert()
        .into(PrivateLessonEmailStatus)
        .values(emailStatusInserts)
        .execute();
    }
  }

  /**
   * Add credit invoice for lessons after new end date.
   * Matches legacy: Invoiceable::addCreditInvoice + Lesson::afterSoftDelete + LessonPayment::afterSoftDelete.
   * - If !hasInvoice(): cancel(), delete() lesson. Legacy then (Lesson::afterSoftDelete) soft-deletes
   *   getCreditAppliedPayment (lesson_payments where payment not TYPE_CREDIT_USED). Each LessonPayment::afterSoftDelete
   *   calls payment->save() (balance recalc) and private_lesson->save(), customer->updateCustomerBalance().
   * - Payment balance = amount - sum(lesson_payment not deleted) - sum(invoice_payment not deleted).
   * - After lp deleted, private_lesson.balance is set back to lesson total (legacy query 11).
   */
  private async addCreditInvoice(
    enrolment: Enrolment,
    endDate: Date,
    loggedUserId: number,
  ): Promise<void> {
    const endDateStr = endDate.toISOString().split('T')[0];

    const lessonsAfterEndDate = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('DATE(lesson.date) > :endDate', { endDate: endDateStr })
      .getMany();

    for (const lesson of lessonsAfterEndDate) {
      const hasInvoice = await this.invoiceItemLessonRepository
        .createQueryBuilder('iil')
        .innerJoin('iil.invoiceLineItem', 'ili')
        .innerJoin('ili.invoice', 'inv')
        .where('iil.lessonId = :lessonId', { lessonId: lesson.id })
        .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('ili.item_type_id = :itemTypeId', { itemTypeId: 1 })
        .andWhere('inv.isDeleted = :invIsDeleted', { invIsDeleted: false })
        .andWhere('inv.type = :invType', { invType: 2 })
        .getCount();

      if (hasInvoice > 0) {
        continue;
      }

      // Legacy: !hasInvoice() -> cancel() + delete(). Then Lesson::afterSoftDelete deletes getCreditAppliedPayment (lp where payment not credit_used).
      await this.lessonRepository.update(lesson.id, {
        status: LessonStatusEnum.CANCELED,
        updatedByUserId: loggedUserId,
      });

      const privateLessonRow = await this.privateLessonRepository.findOne({
        where: { lessonId: lesson.id },
      });

      if (privateLessonRow) {
        const totalPaidForBalance = await this.lessonPaymentRepository
          .createQueryBuilder('lp')
          .leftJoin('lp.payment', 'p')
          .select('SUM(lp.amount)', 'total')
          .where('lp.lessonId = :lessonId', { lessonId: lesson.id })
          .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
          .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
          .andWhere('p.isDeleted = :paymentIsDeleted', { paymentIsDeleted: 0 })
          .andWhere('p.paymentMethodId != :paymentMethodId', { paymentMethodId: 2 })
          .getRawOne();

        const paidForBalance = totalPaidForBalance?.total ? Number(totalPaidForBalance.total) : 0;
        const balance = Number(privateLessonRow.total) - paidForBalance;

        await this.privateLessonRepository.update(privateLessonRow.id, {
          total: privateLessonRow.total,
          balance: Math.max(0, balance),
        });
      }

      await this.lessonRepository.update(lesson.id, {
        isDeleted: true,
        updatedByUserId: loggedUserId,
      });

      if (privateLessonRow) {
        await this.privateLessonRepository.update(privateLessonRow.id, { balance: 0 });
      }

      // Legacy Lesson::afterSoftDelete: getCreditAppliedPayment (payment not TYPE_CREDIT_USED) -> each lp->delete(). Then LessonPayment::afterSoftDelete: payment->save(), private_lesson->save(), customer->updateCustomerBalance().
      const lessonPaymentsToRestore = await this.lessonPaymentRepository.find({
        where: {
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          isDeleted: 0,
        },
        relations: ['payment'],
      });

      const paymentsToRecalc = new Set<number>();
      for (const lp of lessonPaymentsToRestore) {
        if (lp.payment && lp.payment.isDeleted !== 1 && lp.payment.paymentMethodId !== 2) {
          paymentsToRecalc.add(lp.paymentId);
        }
      }

      for (const lp of lessonPaymentsToRestore) {
        if (lp.payment && lp.payment.isDeleted !== 1 && lp.payment.paymentMethodId !== 2) {
          await this.lessonPaymentRepository.update(
            { id: lp.id },
            { isDeleted: 1, updatedByUserId: loggedUserId },
          );
        }
      }

      for (const paymentId of paymentsToRecalc) {
        const lessonUsed = await this.lessonPaymentRepository
          .createQueryBuilder('lp')
          .select('COALESCE(SUM(lp.amount), 0)', 'sum')
          .where('lp.paymentId = :paymentId', { paymentId })
          .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
          .getRawOne<{ sum: string | number }>();
        const invoiceUsed = await this.invoicePaymentRepository
          .createQueryBuilder('ip')
          .select('COALESCE(SUM(ip.amount), 0)', 'sum')
          .where('ip.paymentId = :paymentId', { paymentId })
          .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
          .getRawOne<{ sum: string | number }>();

        const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
        if (!payment) continue;

        const newBalance = RoundingUtils.calculatePaymentBalance(
          payment.amount,
          invoiceUsed?.sum || 0,
          lessonUsed?.sum || 0,
        );
        await this.paymentRepository.update(
          { id: paymentId },
          { balance: newBalance, updatedByUserId: loggedUserId },
        );
      }

      if (privateLessonRow && paymentsToRecalc.size > 0) {
        await this.privateLessonRepository.update(privateLessonRow.id, {
          balance: Number(privateLessonRow.total),
        });
      }
    }

    // Update customer account balance
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId },
    });
    if (course) {
      await this.updateCustomerAccountBalance(enrolment, course.locationId);
    }
  }

  /**
   * Reset payment cycles for shrink operation
   * Matches legacy: EnrolmentPaymentFrequency::resetPaymentCycle() - queries 160-270
   */
  private async resetPaymentCyclesForShrink(
    enrolment: Enrolment,
    effectiveDate: Date,
    paymentFrequency: PaymentFrequency,
  ): Promise<void> {
    // Get payment cycles from effective date onwards (query 160, 234)
    const cyclesToDelete = await this.paymentCycleRepository.find({
      where: {
        enrolmentId: enrolment.id,
        isDeleted: 0,
      },
      order: { startDate: 'ASC' },
    });

    const cyclesAfterEffectiveDate = cyclesToDelete.filter(
      (cycle) => new Date(cycle.startDate) >= effectiveDate,
    );

    // Delete payment cycles (queries 234-243, 244-249)
    // First soft delete payment_cycle_lesson, then payment_cycle
    for (const cycle of cyclesAfterEffectiveDate) {
      // Check if cycle has invoiced lessons (queries 236, 245)
      const cycleLessons = await this.paymentCycleLessonRepository.find({
        where: {
          paymentCycleId: cycle.id,
          isDeleted: 0,
        },
      });

      // Check if any lesson in cycle has invoice
      let hasInvoicedLesson = false;
      for (const cycleLesson of cycleLessons) {
        const hasInvoice = await this.invoiceItemLessonRepository
          .createQueryBuilder('iil')
          .innerJoin('iil.invoiceLineItem', 'ili')
          .innerJoin('ili.invoice', 'inv')
          .where('iil.lessonId = :lessonId', { lessonId: cycleLesson.lessonId })
          .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('ili.item_type_id = :itemTypeId', { itemTypeId: 6 }) // TYPE_PAYMENT_CYCLE_PRIVATE_LESSON = 6
          .andWhere('inv.isDeleted = :invIsDeleted', { invIsDeleted: false })
          .andWhere('inv.type = :invType', { invType: 1 }) // TYPE_PRO_FORMA_INVOICE = 1
          .getCount();

        if (hasInvoice > 0) {
          hasInvoicedLesson = true;
          break;
        }
      }

      // Only delete if no invoiced lessons (queries 239-243, 248-249)
      if (!hasInvoicedLesson) {
        // Soft delete payment_cycle_lesson first (queries 239-242, 248)
        await this.paymentCycleLessonRepository
          .createQueryBuilder()
          .update(PaymentCycleLesson)
          .set({ isDeleted: 1 })
          .where('paymentCycleId = :paymentCycleId', { paymentCycleId: cycle.id })
          .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
          .execute();

        // Then soft delete payment_cycle (queries 243, 249)
        await this.paymentCycleRepository.update(cycle.id, {
          isDeleted: 1,
        });
      }
    }

    // Recalculate payment cycles based on new end date (query 251)
    const courseEndDate = new Date(enrolment.course.endDate);
    const intervalMonths = this.diffInMonths(effectiveDate, courseEndDate);
    const paymentCycleCount = Math.floor(intervalMonths / paymentFrequency.frequencyLength);

    let cycleStartDate = new Date(effectiveDate);
    cycleStartDate.setDate(1); // First day of month

    for (let i = 0; i <= paymentCycleCount; i++) {
      if (i > 0) {
        cycleStartDate = new Date(
          cycleStartDate.getFullYear(),
          cycleStartDate.getMonth() + paymentFrequency.frequencyLength,
          1,
        );
      }

      const cycleEndDate = new Date(
        cycleStartDate.getFullYear(),
        cycleStartDate.getMonth() + paymentFrequency.frequencyLength,
        0, // Last day of previous month
      );

      // Don't extend beyond course end date
      const finalEndDate = cycleEndDate > courseEndDate ? courseEndDate : cycleEndDate;

      if (finalEndDate >= cycleStartDate) {
        // Check if cycle already exists
        const existingCycle = await this.paymentCycleRepository.findOne({
          where: {
            enrolmentId: enrolment.id,
            startDate: cycleStartDate,
            isDeleted: 0,
          },
        });

        if (!existingCycle) {
          const paymentCycle = this.paymentCycleRepository.create({
            enrolmentId: enrolment.id,
            startDate: cycleStartDate,
            endDate: finalEndDate,
            isDeleted: 0,
            isPreferredPaymentEnabled: false,
          });
          const savedCycle = await this.paymentCycleRepository.save(paymentCycle);

          // Link lessons to payment cycle (queries 254-270)
          await this.linkLessonsToPaymentCycle(enrolment, savedCycle);
        }
      }
    }
  }

  /**
   * Link lessons to a payment cycle
   * Matches legacy: Payment cycle lesson linking - queries 254-270
   */
  private async linkLessonsToPaymentCycle(
    enrolment: Enrolment,
    paymentCycle: PaymentCycle,
  ): Promise<void> {
    const cycleStart = new Date(paymentCycle.startDate);
    const cycleEnd = new Date(paymentCycle.endDate);
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    // Find lessons in this payment cycle date range (query 254)
    const lessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('lesson.date BETWEEN :startDate AND :endDate', {
        startDate: `${cycleStartStr} 00:00:00`,
        endDate: `${cycleEndStr} 23:59:59`,
      })
      .orderBy('lesson.date', 'ASC')
      .getMany();

    // Link each lesson to payment cycle (queries 255, 263)
    for (const lesson of lessons) {
      const existingLink = await this.paymentCycleLessonRepository.findOne({
        where: {
          paymentCycleId: paymentCycle.id,
          lessonId: lesson.id,
          isDeleted: 0,
        },
      });

      if (!existingLink) {
        const paymentCycleLesson = this.paymentCycleLessonRepository.create({
          paymentCycleId: paymentCycle.id,
          lessonId: lesson.id,
          isDeleted: 0,
        });
        await this.paymentCycleLessonRepository.save(paymentCycleLesson);
      }
    }

    // Set due dates for lessons in this cycle (queries 140, 153)
    if (lessons.length > 0) {
      const dueDate = calculatePaymentCycleDueDate(
        paymentCycle.startDate,
        lessons.map((lesson) => lesson.originalDate ?? lesson.date),
      );
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Update due date for all lessons in this cycle
      for (const lesson of lessons) {
        await this.lessonRepository.update(lesson.id, {
          dueDate: dueDateStr,
        });
      }
    }
  }

  /**
   * Calculate customer balance
   * Formula: balance = getLessonsDue() + getInvoiceOwingAmountTotal() - getTotalCredits()
   */
  private async calculateCustomerBalance(customerId: number, locationId: number): Promise<number> {
    const [lessonsDue, invoiceOwingAmountTotal, totalCredits] = await Promise.all([
      this.getLessonsDue(customerId, locationId),
      this.getInvoiceOwingAmountTotal(customerId, locationId),
      this.getTotalCredits(customerId, locationId),
    ]);
    
    const balance = lessonsDue + invoiceOwingAmountTotal - totalCredits;
    return RoundingUtils.roundDecimal(balance, 2); // Round to 2 decimals
  }

  /**
   * Get lessons due amount (private + group lessons)
   */
  private async getLessonsDue(customerId: number, locationId: number): Promise<number> {
    const privateLessonsDue = await this.getPrivateLessonsDue(customerId, locationId);
    const groupLessonsOwingAmount = await this.getGroupLessonOwingAmount(customerId, locationId);
    return privateLessonsDue + groupLessonsOwingAmount;
  }

  /**
   * Get private lessons due amount
   */
  private async getPrivateLessonsDue(customerId: number, locationId: number): Promise<number> {
    const nowIso = new Date().toISOString();

    // Build subquery for invoiced lessons
    const invoicedLessonSubQuery = this.lessonRepository
      .createQueryBuilder('ilesson')
      .leftJoin('ilesson.course', 'icourse')
      .leftJoin('icourse.program', 'iprogram')
      .leftJoin('icourse.enrolments', 'ienrolment')
      .leftJoin('ienrolment.student', 'istudent')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .where('ilesson.isDeleted = false')
      .andWhere('ilesson.isConfirmed = true')
      .andWhere('ilesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('icourse.isDeleted = false')
      .andWhere('iprogram.type = :privateProgram', { privateProgram: 1 })
      .andWhere('ienrolment.isDeleted = false')
      .andWhere('ienrolment.isConfirmed = true')
      .andWhere('istudent.customerId = :customerId', { customerId })
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iinv.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .select('ilesson.*');

    // Main query for private lessons due
    const privateLessonsOwingAmount = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson.privateLesson', 'privateLesson')
      .leftJoin('course.enrolments', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'lesson.id = invoiced_lesson.id')
      .setParameters(invoicedLessonSubQuery.getParameters())
      .where('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('lesson.dueDate < :nowIso', { nowIso })
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :privateProgram', { privateProgram: 1 })
      .andWhere('privateLesson.balance > 0.09')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('SUM(privateLesson.balance)', 'total')
      .getRawOne();

    return parseFloat(privateLessonsOwingAmount?.total || '0');
  }

  /**
   * Get group lesson owing amount
   */
  private async getGroupLessonOwingAmount(customerId: number, locationId: number): Promise<number> {
    const nowIso = new Date().toISOString();

    // Build subquery for invoiced group lessons
    const invoicedGroupLessonSubQuery = this.groupLessonRepository
      .createQueryBuilder('igl')
      .leftJoin('igl.lesson', 'ilesson')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .leftJoin('igl.enrolment', 'ienrol')
      .leftJoin('ienrol.invoiceItemEnrolment', 'iie')
      .leftJoin('iie.invoiceLineItem', 'iieli')
      .leftJoin('iieli.invoice', 'iienv')
      .where('iill.id IS NOT NULL')
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iieli.isDeleted = false')
      .andWhere('iienv.isDeleted = false')
      .select('igl.*');

    // Main query for group lessons due
    const groupLessonsOwingAmount = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoin('groupLesson.lesson', 'lesson')
      .leftJoin('groupLesson.enrolment', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedGroupLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'groupLesson.id = invoiced_lesson.id')
      .setParameters(invoicedGroupLessonSubQuery.getParameters())
      .where('groupLesson.isDeleted = false')
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('groupLesson.balance > 0.09')
      .andWhere('groupLesson.dueDate < :nowIso', { nowIso })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('SUM(groupLesson.balance)', 'total')
      .getRawOne();

    return parseFloat(groupLessonsOwingAmount?.total || '0');
  }

  /**
   * Get invoice owing amount total
   *
   * Canceled and void invoices are excluded: they are hidden from every invoice
   * list, so counting their leftover balance here surfaces an amount owing that
   * the customer has no way to see or pay.
   */
  private async getInvoiceOwingAmountTotal(customerId: number, locationId: number): Promise<number> {
    const invoiceOwingAmount = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.balance > 0.09')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
      .select('SUM(invoice.balance)', 'total')
      .getRawOne();

    return parseFloat(invoiceOwingAmount?.total || '0');
  }

  /**
   * Get total credits
   */
  private async getTotalCredits(customerId: number, locationId: number): Promise<number> {
    // Get invoice credits (not deleted)
    const invoiceCredits = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('ROUND(invoice.balance, 2) < -0.1')
      .select('SUM(ABS(invoice.balance))', 'total')
      .getRawOne();

    // Get invoice credits (deleted)
    const rentalInvoiceCredits = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = true')
      .andWhere('ROUND(invoice.balance, 2) < -0.1')
      .select('SUM(ABS(invoice.balance))', 'total')
      .getRawOne();

    // Get payment credits (not deleted, not auto payments)
    const paymentCredits = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :customerId', { customerId })
      .andWhere('payment.isDeleted = false')
      .andWhere('payment.balance > 0.09')
      .andWhere('payment.paymentMethodId NOT IN (:...autoPaymentMethods)', {
        autoPaymentMethods: [1, 2], // Exclude auto payment methods
      })
      .select('SUM(ABS(payment.balance))', 'total')
      .getRawOne();

    const invoiceCreditsTotal = parseFloat(invoiceCredits?.total || '0');
    const rentalInvoiceCreditsTotal = parseFloat(rentalInvoiceCredits?.total || '0');
    const paymentCreditsTotal = parseFloat(paymentCredits?.total || '0');

    return invoiceCreditsTotal + rentalInvoiceCreditsTotal + paymentCreditsTotal;
  }

  /**
   * Update customer account balance
   * Calculates balance using same formula as customer summary API and stores it in customer_account table
   */
  private async updateCustomerAccountBalance(enrolment: Enrolment, locationId: number): Promise<void> {
    const student = await this.studentRepository.findOne({
      where: { id: enrolment.studentId },
    });

    if (!student) {
      return;
    }

    const customerId = student.customerId;

    try {
      // Calculate balance using same formula as customer summary API
      const balanceValue = await this.calculateCustomerBalance(customerId, locationId);

      // Get or create customer account
      let customerAccount = await this.customerAccountRepository.findOne({
        where: { customerId },
      });

      if (!customerAccount) {
        customerAccount = this.customerAccountRepository.create({
          customerId,
          balance: balanceValue,
          createdByUserId: enrolment.updatedByUserId || customerId,
          updatedByUserId: enrolment.updatedByUserId || customerId,
        });
        await this.customerAccountRepository.save(customerAccount);
      } else {
        customerAccount.balance = balanceValue;
        customerAccount.updatedByUserId = enrolment.updatedByUserId || customerId;
        await this.customerAccountRepository.save(customerAccount);
      }
    } catch (error) {
      console.error(`Error updating balance for customer ID: ${customerId}, enrolment ID: ${enrolment.id}`, error);
      throw error;
    }
  }

  /**
   * Reset payment cycles for extend operation
   */
  private async resetPaymentCyclesForExtend(
    enrolment: Enrolment,
    effectiveDate: Date,
    paymentFrequency: PaymentFrequency,
    newEndDate: Date,
  ): Promise<void> {
    // Similar to shrink but extend to new end date
    const intervalMonths = this.diffInMonths(effectiveDate, newEndDate);
    const paymentCycleCount = Math.floor(intervalMonths / paymentFrequency.frequencyLength);

    let cycleStartDate = new Date(effectiveDate);
    cycleStartDate.setDate(1); // First day of month

    for (let i = 0; i <= paymentCycleCount; i++) {
      if (i > 0) {
        cycleStartDate = new Date(
          cycleStartDate.getFullYear(),
          cycleStartDate.getMonth() + paymentFrequency.frequencyLength,
          1,
        );
      }

      const cycleEndDate = new Date(
        cycleStartDate.getFullYear(),
        cycleStartDate.getMonth() + paymentFrequency.frequencyLength,
        0, // Last day of previous month
      );

      const finalEndDate = cycleEndDate > newEndDate ? newEndDate : cycleEndDate;

      if (finalEndDate >= cycleStartDate) {
        // Check if cycle already exists
        const existingCycle = await this.paymentCycleRepository.findOne({
          where: {
            enrolmentId: enrolment.id,
            startDate: cycleStartDate,
            isDeleted: 0,
          },
        });

        if (!existingCycle) {
          const paymentCycle = this.paymentCycleRepository.create({
            enrolmentId: enrolment.id,
            startDate: cycleStartDate,
            endDate: finalEndDate,
            isDeleted: 0,
            isPreferredPaymentEnabled: false,
          });
          await this.paymentCycleRepository.save(paymentCycle);
        }
      }
    }
  }

  /**
   * Update course dates based on actual lesson dates
   * Matches legacy: Course::updateDates()
   */
  private async updateCourseDates(courseId: number): Promise<void> {
    const firstLesson = await this.lessonRepository.findOne({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: true,
        status: Not(LessonStatusEnum.CANCELED),
      },
      order: { date: 'ASC' },
    });

    const lastLesson = await this.lessonRepository.findOne({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: true,
        status: Not(LessonStatusEnum.CANCELED),
      },
      order: { date: 'DESC' },
    });

    if (firstLesson && lastLesson) {
      await this.courseRepository.update(courseId, {
        startDate: firstLesson.date,
        endDate: lastLesson.date,
      });

      // Update enrolment endDateTime
      const enrolment = await this.enrolmentRepository.findOne({
        where: { courseId },
      });

      if (enrolment) {
        await this.enrolmentRepository.update(enrolment.id, {
          endDateTime: lastLesson.date,
        });
      }
    }
  }

  /**
   * Link lessons to payment cycles and set due dates
   * Matches legacy: Payment cycle lesson linking and due date calculation (queries 108-153)
   * OPTIMIZED: Uses bulk inserts and batch updates
   */
  private async linkLessonsToPaymentCycles(
    enrolment: Enrolment,
    lessons: Lesson[],
    preservedDueDates: Map<number, string | null> = new Map(),
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    // Get all payment cycles for this enrolment
    const paymentCycles = await this.paymentCycleRepository.find({
      where: {
        enrolmentId: enrolment.id,
        isDeleted: 0,
      },
      order: { startDate: 'ASC' },
    });

    // Fetch existing links in one query
    const lessonIds = lessons.map(l => l.id);
    const existingLinks = await this.paymentCycleLessonRepository.find({
      where: lessonIds.map(lessonId => ({
        lessonId,
        isDeleted: 0,
      })),
    });
    const existingLinkKeys = new Set(
      existingLinks.map(link => `${link.paymentCycleId}-${link.lessonId}`)
    );

    const linkInserts: any[] = [];
    const dueDateUpdates: Map<string, string> = new Map(); // Map<lessonId, dueDate>

    // Process each payment cycle
    for (const paymentCycle of paymentCycles) {
      const cycleStart = new Date(paymentCycle.startDate);
      const cycleEnd = new Date(paymentCycle.endDate);
      const cycleStartStr = cycleStart.toISOString().split('T')[0];
      const cycleEndStr = cycleEnd.toISOString().split('T')[0];

      // Find lessons that belong to this payment cycle
      const cycleLessons: Lesson[] = [];
      for (const lesson of lessons) {
        const lessonDate = new Date(lesson.date);
        const lessonDateStr = lessonDate.toISOString().split('T')[0];

        if (lessonDateStr >= cycleStartStr && lessonDateStr <= cycleEndStr) {
          cycleLessons.push(lesson);

          // Check if link already exists
          const linkKey = `${paymentCycle.id}-${lesson.id}`;
          if (!existingLinkKeys.has(linkKey)) {
            linkInserts.push({
              paymentCycleId: paymentCycle.id,
              lessonId: lesson.id,
              isDeleted: 0,
            });
            existingLinkKeys.add(linkKey); // Prevent duplicates
          }
        }
      }

      // Clamp the billing month to the later of the cycle boundary and the
      // earliest occurrence represented by the linked lessons.
      if (cycleLessons.length > 0) {
        const dueDate = calculatePaymentCycleDueDate(
          paymentCycle.startDate,
          cycleLessons.map((lesson) => lesson.originalDate ?? lesson.date),
        );
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Store due date for all lessons in this cycle
        for (const lesson of cycleLessons) {
          if (preservedDueDates.has(lesson.id)) {
            continue;
          }
          dueDateUpdates.set(lesson.id.toString(), dueDateStr);
        }
      }
    }

    // Bulk insert all links at once
    if (linkInserts.length > 0) {
      await this.paymentCycleLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PaymentCycleLesson)
        .values(linkInserts)
        .execute();
    }

    // Batch update due dates
    if (dueDateUpdates.size > 0) {
      const updatePromises: Promise<any>[] = [];
      for (const [lessonId, dueDate] of dueDateUpdates) {
        updatePromises.push(
          this.lessonRepository.update(parseInt(lessonId), { dueDate })
        );
      }
      await Promise.all(updatePromises);
    }
  }

  /**
   * Make lessons as root (create lesson_hierarchy entries)
   * Matches legacy: Lesson::makeAsRoot() - creates entry with lessonId = childLessonId, depth = 0
   * OPTIMIZED: Uses bulk insert instead of individual saves
   */
  async makeLessonsAsRoot(
    lessons: Lesson[],
    manager?: EntityManager,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    const lessonHierarchyRepository = manager
      ? manager.getRepository(LessonHierarchy)
      : this.lessonHierarchyRepository;
    const lessonIds = lessons.map(l => l.id);
    
    // Check existing hierarchies in one query
    const existingHierarchies = await lessonHierarchyRepository.find({
      where: lessonIds.map(lessonId => ({
        lessonId,
        childLessonId: lessonId,
      })),
    });

    const existingKeys = new Set(existingHierarchies.map(h => `${h.lessonId}-${h.childLessonId}`));

    // Prepare bulk inserts
    const hierarchyInserts: any[] = [];
    for (const lesson of lessons) {
      const key = `${lesson.id}-${lesson.id}`;
      if (!existingKeys.has(key)) {
        hierarchyInserts.push({
          lessonId: lesson.id,
          childLessonId: lesson.id,
          depth: 0,
        });
      }
    }

    // Bulk insert all hierarchies at once
    if (hierarchyInserts.length > 0) {
      await lessonHierarchyRepository
        .createQueryBuilder()
        .insert()
        .into(LessonHierarchy)
        .values(hierarchyInserts)
        .execute();
    }
  }

  /**
   * Create private_lesson records for lessons
   * Matches legacy: PrivateLesson creation in extend() - queries 60, 83
   */
  /**
   * Create private_lesson records for lessons
   * Matches legacy: PrivateLesson creation after discounts are applied
   * Total = (programRate * unit) - discounts + tax
   */
  async createPrivateLessons(
    lessons: Lesson[],
    enrolment: Enrolment,
    manager?: EntityManager,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    const privateLessonRepository = manager
      ? manager.getRepository(PrivateLesson)
      : this.privateLessonRepository;
    const lessonDiscountRepository = manager
      ? manager.getRepository(LessonDiscount)
      : this.lessonDiscountRepository;
    const lessonIds = lessons.map(l => l.id);
    
    // Check existing private lessons in one query
    const existingPrivateLessons = await privateLessonRepository.find({
      where: lessonIds.map(lessonId => ({ lessonId })),
    });
    const existingLessonIds = new Set(existingPrivateLessons.map(pl => pl.lessonId));

    // Fetch all discounts for all lessons in one query
    const allDiscounts = await lessonDiscountRepository.find({
      where: lessonIds.map(lessonId => ({ lessonId })),
    });
    
    // Group discounts by lessonId for fast lookup
    const discountsByLessonId = new Map<number, any[]>();
    for (const discount of allDiscounts) {
      if (!discountsByLessonId.has(discount.lessonId)) {
        discountsByLessonId.set(discount.lessonId, []);
      }
      discountsByLessonId.get(discount.lessonId)!.push(discount);
    }
    
    const privateLessonInserts: any[] = [];
    
    for (const lesson of lessons) {
      if (existingLessonIds.has(lesson.id)) {
        continue;
      }

      // Calculate expiryDate: lesson date + 90 days
      const lessonDate = new Date(lesson.date);
      const expiryDate = new Date(lessonDate);
      expiryDate.setDate(expiryDate.getDate() + 90);

      // IMPORTANT: In legacy, lesson.programRate is the HOURLY rate, not the lesson price
      // Calculate unit (duration in hours) - matches legacy getUnit()
      const durationInHours = this.durationToHours(lesson.duration);
      
      // Calculate gross price = hourly rate * duration in hours
      // Matches legacy: grossPrice = programRate * unit
      const grossPrice = Number(lesson.programRate) * durationInHours;
      
      // Get discounts for this lesson from the pre-fetched map
      const lessonDiscounts = discountsByLessonId.get(lesson.id) || [];

      const totalDiscount = this.calculatePrivateLessonDiscount(
        grossPrice,
        lessonDiscounts,
      );
      
      // Calculate net price = gross price - discounts + tax
      // Matches legacy: netPrice = (grossPrice - discount) + tax
      const netPrice = grossPrice - totalDiscount + Number(lesson.tax || 0);
      const total = RoundingUtils.roundDecimal(netPrice, 2);
      const balance = total; // On creation, balance = total

      privateLessonInserts.push({
        lessonId: lesson.id,
        expiryDate,
        total,
        balance,
        dueDate: new Date(lessonDate.toISOString().split('T')[0]),
      });
    }

    // Bulk insert all private lessons at once
    if (privateLessonInserts.length > 0) {
      await privateLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PrivateLesson)
        .values(privateLessonInserts)
        .execute();
    }
  }

  /**
   * Match Lesson.getDiscount(): fixed enrolment discount categories determine
   * their units. Dirty historical valueType metadata must never turn PF into a
   * flat-dollar discount or Multiple Enrolment into a percentage discount.
   */
  private calculatePrivateLessonDiscount(
    grossPrice: number,
    discounts: Array<Pick<LessonDiscount, 'type' | 'value' | 'valueType'>>,
  ): number {
    let totalDiscount = 0;
    let currentPrice = grossPrice;

    const discountOrder = [
      LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
      LessonDiscount.TYPE_LINE_ITEM,
      LessonDiscount.TYPE_CUSTOMER,
      // Prepaid sits here, immediately before payment frequency, and stops the
      // loop rather than adding to it - see below.
      LessonDiscount.TYPE_PREPAID_CYCLE,
      LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
    ];

    for (const type of discountOrder) {
      const discount = discounts.find((item) => item.type === type);
      if (!discount) {
        continue;
      }

      // Prepaid is a dollar amount and it **replaces** payment frequency
      // instead of stacking with it - both express the same entitlement to a
      // cheaper cycle, so applying both discounts the lesson twice. Mirrors the
      // early return in `Lesson.getDiscount()`; the two must agree or a lesson
      // costs one thing when it is created and another when it is billed.
      if (type === LessonDiscount.TYPE_PREPAID_CYCLE) {
        const prepaid = Number(discount.value ?? 0);
        return totalDiscount + prepaidReduction(prepaid, currentPrice);
      }

      const value = Number(discount.value ?? 0);
      let discountAmount: number;

      if (type === LessonDiscount.TYPE_MULTIPLE_ENROLMENT) {
        discountAmount = currentPrice < 0 ? 0 : value;
      } else if (
        type === LessonDiscount.TYPE_CUSTOMER ||
        type === LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY ||
        discount.valueType === 1
      ) {
        discountAmount = (currentPrice * value) / 100;
      } else {
        discountAmount = currentPrice < 0 ? 0 : value;
      }

      totalDiscount += discountAmount;
      currentPrice = grossPrice - totalDiscount;
    }

    return totalDiscount;
  }

  /**
   * Update student and user status
   * Matches legacy: Enrolment::setStatus() - queries 203-211
   */
  async updateStudentAndUserStatus(enrolment: Enrolment): Promise<void> {
    const student = await this.studentRepository.findOne({
      where: { id: enrolment.studentId },
    });

    if (!student) return;

    // Get all enrolments for this student
    const allEnrolments = await this.enrolmentRepository.find({
      where: {
        studentId: student.id,
        isDeleted: false,
        isConfirmed: 1, // isConfirmed is a number (0 or 1)
      },
      relations: ['course'],
    });

    // Check if student has any active enrolments
    let hasActiveEnrolment = false;
    const currentDate = new Date();
    const currentDateStr = currentDate.toISOString().split('T')[0];

    for (const enrol of allEnrolments) {
      if (enrol.course && !enrol.course.isDeleted) {
        // Validate dates before using them
        if (!enrol.course.startDate || !enrol.course.endDate) {
          continue; // Skip if dates are missing
        }

        const startDate = new Date(enrol.course.startDate);
        const endDate = new Date(enrol.course.endDate);

        // Check if dates are valid
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          continue; // Skip if dates are invalid
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        if (startDateStr <= currentDateStr && currentDateStr <= endDateStr) {
          hasActiveEnrolment = true;
          break;
        }
      }
    }

    // Update student status (1 = active, 2 = inactive)
    // Note: isDeleted might be a number in the database, check entity definition
    await this.studentRepository.update(student.id, {
      status: hasActiveEnrolment ? 1 : 2,
      isDeleted: 0, // Use 0 for false if it's a number type
    });

    // Get user from student (student has user relation via customer_id)
    const user = await this.userRepository.findOne({
      where: { id: student.customerId },
    });

    if (user) {
      // Update user status (2 = active, 1 = not active)
      await this.userRepository.update(user.id, {
        status: hasActiveEnrolment ? 2 : 1,
        isDeleted: false, // User.isDeleted is boolean
      });
    }
  }

  /**
   * Shrink group enrolment - delete group lessons after new end date
   * Matches legacy: GroupEnrolmentController::actionEditEndDate() POST logic
   */
  private async shrinkGroupEnrolment(
    enrolment: Enrolment,
    newEndDate: Date,
    loggedUserId: number,
  ): Promise<void> {
    // Find group lessons after new end date (matching legacy query)
    // Legacy: GroupLesson::find()->andWhere(['group_lesson.enrolmentId' => $model->id])
    //   ->joinWith(['lesson' => function ($query) use($courseEndDate) { 
    //     $query->andWhere(['>', 'DATE(lesson.date)', Carbon::parse($courseEndDate)->format('Y-m-d')]);
    //   }])
    const newEndDateStr = newEndDate.toISOString().split('T')[0];
    
    const groupLessons = await this.groupLessonRepository
      .createQueryBuilder('gl')
      .innerJoin('gl.lesson', 'lesson')
      .where('gl.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
      .andWhere('gl.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('DATE(lesson.date) > :endDate', { endDate: newEndDateStr })
      .getMany();

    // Revert group lessons credit (delete group lessons without invoices)
    await this.revertGroupLessonsCredit(groupLessons, enrolment);
  }

  /**
   * Revert group lessons credit - delete group lessons that don't have invoices
   * Matches legacy: Enrolment::revertGroupLessonsCredit()
   * Legacy: if (!$groupLesson->lesson->hasInvoice()) { $groupLesson->delete(); }
   * 
   * For group lessons, invoice check matches legacy Lesson::getInvoiceLineItems():
   * - Lesson -> Course -> InvoiceItemEnrolment (via course, where enrolmentId matches)
   * - InvoiceItemEnrolment -> InvoiceLineItem (with item_type_id = TYPE_GROUP_LESSON)
   * - InvoiceLineItem -> Invoice (type = TYPE_INVOICE, not deleted)
   * 
   * Also checks lesson_payment (query 17, 25 in legacy logs)
   * 
   * Legacy queries show:
   * - Query 14: Check invoice_item_enrolment (via course relationship)
   * - Query 15: Check invoice_line_item with item_type_id=2
   * - Query 16: Check invoice
   * - Query 17/25: Check lesson_payment
   */
  private async revertGroupLessonsCredit(
    groupLessons: GroupLesson[],
    enrolment: Enrolment,
  ): Promise<void> {
    for (const groupLesson of groupLessons) {
      // Get the lesson to access course
      const lesson = await this.lessonRepository.findOne({
        where: { id: groupLesson.lessonId },
        relations: ['course'],
      });

      if (!lesson) {
        continue;
      }

      // Check if the lesson has an invoice (matching legacy: $groupLesson->lesson->hasInvoice())
      // For group lessons: check via invoiceItemsEnrolment through course
      // Legacy: Lesson::getInvoiceLineItems() for group uses via('invoiceItemsEnrolment')
      // which is: hasMany(InvoiceItemEnrolment, ['enrolmentId' => 'enrolmentId'])->via('course')
      // 
      // The relationship is: Lesson -> Course -> InvoiceItemEnrolment (where enrolmentId matches)
      // Then: InvoiceItemEnrolment -> InvoiceLineItem (with item_type_id = TYPE_GROUP_LESSON)
      // And: InvoiceLineItem -> Invoice (type = TYPE_INVOICE)
      // Also need to check if lesson is linked via InvoiceItemLesson
      const hasInvoice = await this.invoiceLineItemRepository
        .createQueryBuilder('ili')
        .innerJoin('ili.invoiceItemEnrolment', 'iie', 'iie.invoiceLineItemId = ili.id')
        .innerJoin('ili.invoiceItemLesson', 'iil', 'iil.invoiceLineItemId = ili.id')
        .innerJoin('ili.invoice', 'inv')
        .where('iie.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
        .andWhere('iil.lessonId = :lessonId', { lessonId: groupLesson.lessonId })
        .andWhere('ili.item_type_id = :itemTypeId', { itemTypeId: 2 }) // TYPE_GROUP_LESSON = 2
        .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('inv.isDeleted = :invIsDeleted', { invIsDeleted: false })
        .andWhere('inv.type = :invType', { invType: 2 }) // TYPE_INVOICE = 2
        .getCount();

      // Also check if there's a lesson_payment (matching legacy queries 17, 25)
      const hasPayment = await this.lessonPaymentRepository
        .createQueryBuilder('lp')
        .where('lp.lessonId = :lessonId', { lessonId: groupLesson.lessonId })
        .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
        .andWhere('lp.isDeleted = :isDeleted', { isDeleted: false })
        .getCount();

      // Only delete if lesson has NO invoice AND NO payment (matching legacy: if (!$groupLesson->lesson->hasInvoice()))
      if (hasInvoice === 0 && hasPayment === 0) {
        // Soft delete the group lesson (matching legacy: $groupLesson->delete())
        await this.groupLessonRepository.update(groupLesson.id, {
          isDeleted: true,
        });
      }
    }
  }

  /**
   * Calculate difference in months between two dates
   */
  private diffInMonths(date1: Date, date2: Date): number {
    const diff = date2.getTime() - date1.getTime();
    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
    return months;
  }
}
