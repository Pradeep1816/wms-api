import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerEnrolmentsRequestDto } from '../dto/customer-enrolments-request.dto';
import { CustomerEnrolmentDto, CustomerEnrolmentsDataDto } from '../dto/customer-enrolments-response.dto';
import { EnrolmentSearchDto } from '../dto/enrolment-list-request.dto';
import { EnrolmentListDataDto } from '../dto/enrolment-list-response.dto';
import { EnrolmentRepository } from '../repositories/enrolment.repository';
import { EnrolmentListTransformationService } from './transformations/enrolment-list-transformation.service';
import { formatDate, getWeekdaysList, getCurrentESTDate } from '../../utils/date-utils';
import { formatDuration, formatTime } from '../../utils/formatters';
import { GroupCourseFormDto } from '../dto/group-course-form.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, LessThan } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { EnrolmentDiscount } from '../entities/enrolment-discount.entity';
import { EnrolmentPaymentFrequency } from '../entities/enrolment-payment-frequency.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { GroupEnrolmentPreviewResponseDto, LessonPreviewDto } from '../dto/group-enrolment-preview-response.dto';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { GroupLessonEmailStatus } from '../../lesson/entities/group-lesson-email-status.entity';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { Log } from '../../log/entities/log.entity';
import { LogLink } from '../../log/entities/log-link.entity';
import { LogHistory } from '../../log/entities/log-history.entity';
import { User } from '../../user/entities/user.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Student } from '../../student/entities/student.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { EditProgramRateRequestDto } from '../dto/edit-program-rate-request.dto';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { Program } from '../../program/entities/program.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoiceItemEnrolment } from '../../invoice/entities/invoice-item-enrolment.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { LessonPayment } from '../../payment/entities/lesson-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { LessonModule } from '../../lesson/lesson.module';
import { forwardRef, Inject } from '@nestjs/common';
import { LessonConfirmationService } from '../../lesson/services/lesson-confirmation.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EnrolmentDeletePreviewResponseDto, DeletePreviewItemDto, DeletePreviewPaymentDto } from '../dto/enrolment-delete-preview-response.dto';
import { PaymentCycleLesson } from '../entities/payment-cycle-lesson.entity';
import { EnrolmentDiscountPreviewResponseDto, DiscountPreviewItemDto } from '../dto/enrolment-discount-preview-response.dto';
import { UpdateEnrolmentDiscountsRequestDto } from '../dto/update-enrolment-discounts-request.dto';
import { UpdateGroupEnrolmentDiscountRequestDto } from '../dto/update-group-enrolment-discount-request.dto';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
// import { CourseSchedule } from '../../course/entities/course-schedule.entity';

type PrivateDiscountCycleRange = {
  startDate: Date;
  endDate: Date;
};

@Injectable()
export class EnrolmentService {
  constructor(
    private readonly enrolmentRepository: EnrolmentRepository,
    private readonly enrolmentListTransformationService: EnrolmentListTransformationService,
    @InjectRepository(Enrolment)
    private readonly enrolmentEntityRepository: Repository<Enrolment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(EnrolmentDiscount)
    private readonly enrolmentDiscountRepository: Repository<EnrolmentDiscount>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(GroupLessonEmailStatus)
    private readonly groupLessonEmailStatusRepository: Repository<GroupLessonEmailStatus>,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(InvoiceItemLesson)
    private readonly invoiceItemLessonRepository: Repository<InvoiceItemLesson>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoiceItemEnrolment)
    private readonly invoiceItemEnrolmentRepository: Repository<InvoiceItemEnrolment>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentCycle)
    private readonly paymentCycleRepository: Repository<PaymentCycle>,
    @Inject(forwardRef(() => LessonConfirmationService))
    private readonly lessonConfirmationService: LessonConfirmationService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
  ) {}

  async getEnrolmentsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerEnrolmentsRequestDto,
  ): Promise<CustomerEnrolmentsDataDto> {
    try {
      // Get location
      const location = await this.enrolmentRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new NotFoundException(`Location not found: ${locationSlug}`);
      }

      // Get customer
      const customer = await this.enrolmentRepository.findCustomerByIdAndLocation(
        customerId,
        location.id,
      );
      if (!customer) {
        throw new NotFoundException(`Customer not found: ${customerId}`);
      }

      // Get enrolments with pagination
      const { enrolments, total } = await this.enrolmentRepository.getEnrolmentData(
        customerId,
        location.id,
        query.page,
        query.limit,
      );

      // Transform enrolments to DTOs
      const enrolmentData: CustomerEnrolmentDto[] = enrolments.map(enrolment => 
        this.transformEnrolmentToDto(enrolment)
      );

      // Calculate pagination
      const { page = 1, limit = 10 } = query;
      const totalPages = Math.ceil(total / limit);

      return {
        body: enrolmentData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve customer enrolments: ${error.message}`);
    }
  }

  /**
   * Transform enrolment entity to DTO
   */
  private transformEnrolmentToDto(enrolment: any): CustomerEnrolmentDto {
    const student = enrolment.student;
    const course = enrolment.course;
    const program = course?.program;
    const courseSchedule = course?.courseSchedule?.[0]; // Get first schedule
    const lesson = course?.lessons?.[0];
    const teacher = lesson?.teacher;

    // Format day name using courseSchedule day
    const day = courseSchedule?.day;
    const weekdays = getWeekdaysList();
    const weekday = weekdays[day];
    const fromTime = formatTime(courseSchedule?.fromTime) || '';
    
  
    // Get teacher name from profile
    const teacherName = teacher?.profile ? 
      `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim() : '';
    
    return {
      id: enrolment.id,
      studentName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
      programName: program?.name || '',
      teacherName: teacherName,
      day: weekday,
      fromTime: fromTime,
      duration: formatDuration(courseSchedule?.duration),
      startDate: formatDate(course?.startDate),
      renewalDate: formatDate(enrolment.endDateTime),
    };
  }

  /**
   * Get enrolments list
  */
  async getEnrolmentsList(
    locationId: number,
    searchDto: EnrolmentSearchDto,
  ): Promise<EnrolmentListDataDto> {
    try {
      const { enrolments, total } = await this.enrolmentRepository.getEnrolmentsList(
        locationId,
        searchDto,
      );

      // Get IDs for batch loading
      const enrolmentIds = enrolments.map(e => e.id);
      const courseIds = [...new Set(enrolments.map(e => e.course?.id).filter(Boolean))];

      // Load lessons count and schedules in parallel
      const [lessonsRemainingMap, schedulesMap] = await Promise.all([
        this.enrolmentRepository.getFutureLessonsCountBatch(enrolmentIds),
        this.enrolmentRepository.getTeachersSchedules(courseIds),
      ]);

      // Attach schedules to courses
      enrolments.forEach(enrolment => {
        if (enrolment.course) {
          enrolment.course.courseSchedule = schedulesMap.get(enrolment.course.id) || [];
        }
      });

      // Transform enrolments to DTOs
      const { page = 1, limit = 20 } = searchDto;
      return this.enrolmentListTransformationService.transformEnrolmentsData(
        enrolments,
        lessonsRemainingMap,
        total,
        page,
        limit,
      );
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve enrolments list: ${error.message}`);
    }
  }

  /**
   * Apply group enrolment - creates unconfirmed enrolment, applies discount, returns lesson preview
   * Matches legacy: EnrolmentController::actionGroupApply()
   */
  async applyGroupEnrolment(
    locationId: number,
    groupCourseForm: GroupCourseFormDto,
    loggedUserId: number,
  ): Promise<GroupEnrolmentPreviewResponseDto> {
    if (!groupCourseForm.studentId || !groupCourseForm.courseId) {
      throw new BadRequestException('Student ID and Course ID are required');
    }

    // Get course
    const course = await this.courseRepository.findOne({
      where: { id: groupCourseForm.courseId, locationId },
    });

    if (!course) {
      throw new NotFoundException(`Course not found: ${groupCourseForm.courseId}`);
    }

    const now = getCurrentESTDate();
    
    // Create unconfirmed enrolment
    const enrolment = this.enrolmentEntityRepository.create({
      studentId: groupCourseForm.studentId,
      courseId: groupCourseForm.courseId,
      paymentFrequencyId: 12, // LENGTH_FULL = 12 (PaymentFrequency::LENGTH_FULL)
      isConfirmed: 0, // false = unconfirmed
      isDeleted: false,
      isAutoRenew: 0,
      isOnline: 0,
      createdByUserId: loggedUserId,
      updatedByUserId: loggedUserId,
      isEnableInfo: false,
      isEnableRescheduleInfo: false,
      createdAt: now,
      updatedAt: now,
    });

    const savedEnrolment = await this.enrolmentEntityRepository.save(enrolment);

    // Apply discount if provided
    if (groupCourseForm.discount && parseFloat(groupCourseForm.discount) > 0) {
      await this.dataSource.transaction(async (manager) => {
        if (manager.queryRunner) {
          manager.queryRunner.data = {
            ...(manager.queryRunner.data ?? {}),
            currentUserId: loggedUserId,
          };
        }
        const enrolmentDiscountRepository = manager.getRepository(EnrolmentDiscount);
        const lessonRepository = manager.getRepository(Lesson);
        const lessonDiscountRepository = manager.getRepository(LessonDiscount);
        const discountValue = parseFloat(groupCourseForm.discount!);
        const discountType = groupCourseForm.discountType ?? EnrolmentDiscount.VALUE_TYPE_DOLLAR;

        // Create enrolment discount
        const enrolmentDiscount = enrolmentDiscountRepository.create({
          enrolmentId: savedEnrolment.id,
          discount: discountValue,
          discountType: discountType,
          type: EnrolmentDiscount.TYPE_GROUP,
        });
        await enrolmentDiscountRepository.save(enrolmentDiscount);

      // Get lessons for the course
        const lessons = await lessonRepository.find({
        where: {
          courseId: course.id,
          status: Not(LessonStatusEnum.CANCELED),
          isConfirmed: true,
          isDeleted: false,
        },
        order: {
          date: 'ASC',
        },
      });

      const lessonCount = lessons.length;

      if (lessonCount > 0) {
        // Calculate discount per lesson
        let pricePerLesson: number;
        let lastLessonPrice: number;

        if (discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR) {
          // Dollar discount: distribute across lessons
          pricePerLesson = RoundingUtils.roundDecimal(discountValue / lessonCount, 2);
          lastLessonPrice = RoundingUtils.roundDecimal(
            discountValue - pricePerLesson * (lessonCount - 1),
            2,
          );
        } else {
          // Percentage discount: will be applied per lesson
          pricePerLesson = discountValue;
          lastLessonPrice = discountValue;
        }

          // Create lesson discounts
          for (let i = 0; i < lessons.length; i++) {
            const lesson = lessons[i];
            const lessonDiscountValue =
              discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR
                ? i === lessonCount - 1
                  ? lastLessonPrice
                  : pricePerLesson
                : pricePerLesson;

            const lessonDiscount = lessonDiscountRepository.create({
              lessonId: lesson.id,
              enrolmentId: savedEnrolment.id,
              value: lessonDiscountValue,
              // LessonDiscount constants are OPPOSITE of EnrolmentDiscount:
              // EnrolmentDiscount: PERCENTAGE=0, DOLLAR=1
              // LessonDiscount: PERCENTAGE=1, DOLLAR=0
              valueType: discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR ? 0 : 1,
              type: 5, // TYPE_GROUP = 5 (LessonDiscount::TYPE_GROUP)
            });
            await lessonDiscountRepository.save(lessonDiscount);
          }
        }
      });
    }

    // Get lessons for preview (not canceled, confirmed, not deleted, ordered by date)
    // Load discounts relation to calculate discount per lesson
    const previewLessons = await this.lessonRepository.find({
      where: {
        courseId: course.id,
        status: Not(LessonStatusEnum.CANCELED),
        isConfirmed: true,
        isDeleted: false,
      },
      relations: ['discounts'],
      order: {
        date: 'ASC',
      },
    });

    // Transform lessons to preview DTO using per-lesson legacy discount math.
    const lessonPreviews: LessonPreviewDto[] = previewLessons.map((lesson) => {
      // Legacy parity: preview is pre-tax, and gross price is rounded to 2 decimals first.
      const grossPrice = RoundingUtils.roundDecimal(Number(lesson.programRate ?? 0), 2);

      // Get discount for this lesson
      const lessonDiscount = lesson.discounts?.find(
        (d) => d.enrolmentId === savedEnrolment.id && d.type === 5, // TYPE_GROUP = 5
      );
      
      let discount = 0;
      if (lessonDiscount) {
        if (lessonDiscount.valueType === 0) {
          // Dollar discount: use stored value
          discount = Number(lessonDiscount.value || 0);
        } else {
          // Percentage discount: apply to the lesson's own gross price.
          discount = (grossPrice * Number(lessonDiscount.value || 0)) / 100;
        }
      }

      // Format duration from HH:mm:ss to HH:mm
      const durationParts = lesson.duration.split(':');
      const duration = `${durationParts[0]}:${durationParts[1]}`;
      // Calculate with the exact discount, then expose cent-safe values whose
      // displayed arithmetic remains consistent: price - discount = total.
      const total = RoundingUtils.roundDecimal(grossPrice - discount, 2);
      const appliedDiscount = RoundingUtils.roundDecimal(grossPrice - total, 2);

      return {
        id: lesson.id,
        dateTime: lesson.date.toISOString(),
        duration,
        price: grossPrice,
        discount: appliedDiscount,
        total,
      };
    });

    return {
      enrolmentId: savedEnrolment.id,
      lessons: lessonPreviews,
    };
  }

  /**
   * Confirm group enrolment - sets isConfirmed=true, creates GroupLesson records
   * Matches legacy: EnrolmentController::actionGroupConfirm()
   */
  async confirmGroupEnrolment(
    locationId: number,
    locationSlug: string,
    enrolmentId: number,
    loggedUserId: number,
  ): Promise<{ enrolmentId: number }> {
    // Get enrolment
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'student'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    // Set isConfirmed = true
    enrolment.isConfirmed = 1;
    
    // Set endDateTime to course.endDate (format: YYYY-MM-DD)
    if (course.endDate) {
      const endDate = new Date(course.endDate);
      endDate.setHours(0, 0, 0, 0);
      enrolment.endDateTime = endDate;
    }

    // Save enrolment
    enrolment.updatedByUserId = loggedUserId;
    await this.enrolmentEntityRepository.save(enrolment);

    // Get all lessons for the course (not canceled, confirmed, not deleted)
    // Load discounts relation to calculate total/balance
    const lessons = await this.lessonRepository.find({
      where: {
        courseId: course.id,
        status: Not(LessonStatusEnum.CANCELED),
        isConfirmed: true,
        isDeleted: false,
      },
      relations: ['discounts'],
      order: {
        date: 'ASC',
      },
    });

    // Create GroupLesson records for each lesson (optimized with batch operations)
    const dueDate = enrolment.createdAt 
      ? new Date(enrolment.createdAt)
      : new Date();
    dueDate.setHours(0, 0, 0, 0); // Set to start of day (YYYY-MM-DD format)
    const now = getCurrentESTDate();

    if (lessons.length === 0) {
      // No lessons to process
    } else {
      // Check existing GroupLessons in bulk
      const lessonIds = lessons.map(l => l.id);
      const existingGroupLessons = await this.groupLessonRepository.find({
        where: {
          lessonId: In(lessonIds),
          enrolmentId: enrolment.id,
        },
      });
      const existingGroupLessonLessonIds = new Set(existingGroupLessons.map(gl => gl.lessonId));

      // Prepare GroupLesson records to insert
      const groupLessonsToInsert: GroupLesson[] = [];
      const emailStatusesToInsert: GroupLessonEmailStatus[] = [];

      for (const lesson of lessons) {
        // Skip if GroupLesson already exists
        if (existingGroupLessonLessonIds.has(lesson.id)) {
          continue;
        }

        // Legacy parity: round the lesson rate to 2 decimals before discounting, then add tax.
        const grossPrice = RoundingUtils.decimal(
          RoundingUtils.roundDecimal(Number(lesson.programRate || 0), 2),
        );
        
        // Get discount for this lesson (TYPE_GROUP = 5)
        const lessonDiscount = lesson.discounts?.find(
          (d) => d.enrolmentId === enrolment.id && d.type === 5,
        );
        const discount = lessonDiscount
          ? lessonDiscount.valueType === 0 // 0 = dollar, 1 = percentage (LessonDiscount constants)
            ? RoundingUtils.decimal(lessonDiscount.value || 0) // Dollar discount
            : RoundingUtils.decimal(lessonDiscount.value || 0)
                .dividedBy(100)
                .multipliedBy(grossPrice) // Percentage discount
          : RoundingUtils.decimal(0);

        // Group lessons are billed and paid in cents. Persisting a sub-cent
        // total here can leave a hidden balance after a cent-based payment.
        const roundedTotal = RoundingUtils.roundDecimal(
          grossPrice.minus(discount).plus(lesson.tax || 0),
          2,
        );

        // Calculate balance: total - creditAppliedAmount (initially 0, so balance = total)
        const creditAppliedAmount = 0; // No credits applied on initial creation
        const roundedBalance = RoundingUtils.roundDecimal(
          RoundingUtils.decimal(roundedTotal).minus(creditAppliedAmount),
          2,
        );
        
        // Calculate paidStatus using legacy exact-zero semantics.
        let paidStatus = GroupLesson.STATUS_OWING; // Default
        if (roundedBalance === 0) {
          paidStatus = GroupLesson.STATUS_PAID;
        } else if (roundedBalance > 0) {
          paidStatus = GroupLesson.STATUS_OWING;
        } else if (roundedBalance < 0) {
          paidStatus = GroupLesson.STATUS_CREDIT;
        }

        const groupLesson = this.groupLessonRepository.create({
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          dueDate: dueDate,
          paidStatus: paidStatus,
          total: roundedTotal,
          balance: roundedBalance,
          isDeleted: false,
          createdByUserId: loggedUserId,
          updatedByUserId: loggedUserId,
          createdOn: now,
          updatedOn: now,
        });
        groupLessonsToInsert.push(groupLesson);

        // Prepare GroupLessonEmailStatus records for each notification type (1-4)
        // This matches legacy: foreach ($emailNotifyTypes as $emailNotifyType)
        const notificationTypes = [1, 2, 3, 4]; // Notification types from legacy
        for (const notificationType of notificationTypes) {
          const emailStatus = this.groupLessonEmailStatusRepository.create({
            lessonId: lesson.id,
            studentId: enrolment.studentId,
            notificationType: notificationType,
            status: 0, // false = 0 (matching legacy line 394)
          });
          emailStatusesToInsert.push(emailStatus);
        }
      }

      // Batch insert GroupLessons
      if (groupLessonsToInsert.length > 0) {
        await this.groupLessonRepository.save(groupLessonsToInsert);
      }

      // Check existing email statuses in bulk before inserting
      if (emailStatusesToInsert.length > 0) {
        const existingEmailStatuses = await this.groupLessonEmailStatusRepository.find({
          where: {
            lessonId: In(lessonIds),
            studentId: enrolment.studentId,
            notificationType: In([1, 2, 3, 4]),
          },
        });
        
        // Create a set of existing combinations for quick lookup
        const existingEmailStatusKeys = new Set(
          existingEmailStatuses.map(es => `${es.lessonId}-${es.studentId}-${es.notificationType}`)
        );

        // Filter out email statuses that already exist
        const emailStatusesToInsertFiltered = emailStatusesToInsert.filter(es => {
          const key = `${es.lessonId}-${es.studentId}-${es.notificationType}`;
          return !existingEmailStatusKeys.has(key);
        });

        // Batch insert email statuses
        if (emailStatusesToInsertFiltered.length > 0) {
          await this.groupLessonEmailStatusRepository.save(emailStatusesToInsertFiltered);
        }
      }
    }

    // Create log entry (matching legacy StudentLog::addGroupEnrolment())
    try {
      // Get logged user with profile
      const loggedUser = await this.userRepository.findOne({
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      if (!loggedUser || !loggedUser.profile) {
        // Skip log creation if user not found
      } else {
        // Get student with customer for location
        const student = await this.studentRepository.findOne({
          where: { id: enrolment.studentId },
          relations: ['customer', 'customer.userLocation', 'customer.userLocation.location'],
        });

        if (!student) {
          // Skip log creation if student not found
        } else {
          // Get course schedule for day and time
          const courseSchedule = await this.courseScheduleRepository.findOne({
            where: { courseId: course.id, isRecent: true },
          });

          // Get course with program and teacher
          const courseWithRelations = await this.courseRepository.findOne({
            where: { id: course.id },
            relations: ['program', 'teacher', 'teacher.profile'],
          });

          if (!courseWithRelations || !courseWithRelations.program) {
            // Skip log creation if course or program not found
          } else {
            // Build message: "{loggedUser} enrolled {{studentName}} in {programName} lessons with {{teacherName}} on {day}s at {time}"
            const loggedUserIdentity = loggedUser.profile.firstname && loggedUser.profile.lastname
              ? `${loggedUser.profile.firstname} ${loggedUser.profile.lastname}`.trim()
              : loggedUser.profile.firstname || loggedUser.profile.lastname || loggedUser.username || `User ${loggedUser.id}`;

            const studentName = student.firstName && student.lastName
              ? `${student.firstName} ${student.lastName}`.trim()
              : student.firstName || student.lastName || 'Unknown';

            const programName = courseWithRelations.program.name || 'Unknown';

            const teacherName = courseWithRelations.teacher?.profile
              ? (courseWithRelations.teacher.profile.firstname && courseWithRelations.teacher.profile.lastname
                  ? `${courseWithRelations.teacher.profile.firstname} ${courseWithRelations.teacher.profile.lastname}`.trim()
                  : courseWithRelations.teacher.profile.firstname || courseWithRelations.teacher.profile.lastname || 'Unknown')
              : 'Unknown';

            // Get day name from schedule
            const dayList = getWeekdaysList();
            const day = courseSchedule?.day !== undefined ? dayList[courseSchedule.day] : 'Unknown';
            const dayPlural = day !== 'Unknown' ? `${day}s` : 'Unknown';

            // Format time from course startDate (matching legacy Yii::$app->formatter->asTime())
            const time = course.startDate ? formatTime(course.startDate) || 'Unknown' : 'Unknown';

            const message = `${loggedUserIdentity} enrolled  {{${studentName}}} in ${programName}  lessons with {{${teacherName}}} on ${dayPlural} at ${time}`;

            // Get log object (student) and activity (create)
            const logObject = await this.logObjectRepository.findLogObjectByName('student');
            const logActivity = await this.logActivityRepository.findLogActivityByName('create');

            if (logObject && logActivity) {
              // Get enrolment data as JSON (matching legacy format)
              const enrolmentData = {
                id: enrolment.id.toString(),
                courseId: enrolment.courseId.toString(),
                studentId: enrolment.studentId.toString(),
                isDeleted: enrolment.isDeleted ? '1' : '0',
                endDateTime: enrolment.endDateTime ? enrolment.endDateTime.toISOString().split('T')[0] + ' 12:00:00' : null,
                paymentFrequencyId: enrolment.paymentFrequencyId.toString(),
                isConfirmed: enrolment.isConfirmed ? '1' : '0',
                isAutoRenew: enrolment.isAutoRenew ? '1' : '0',
                is_online: enrolment.isOnline ? '1' : '0',
                createdAt: enrolment.createdAt ? enrolment.createdAt.toISOString().replace('T', ' ').substring(0, 19) : null,
                updatedAt: enrolment.updatedAt ? enrolment.updatedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
                createdByUserId: enrolment.createdByUserId?.toString() || '0',
                updatedByUserId: enrolment.updatedByUserId?.toString() || '0',
                isEnableInfo: enrolment.isEnableInfo ? '1' : '0',
                isEnableRescheduleInfo: enrolment.isEnableRescheduleInfo ? '1' : '0',
              };

              const baseUrl = process.env.BASE_URL || '';
              const studentPath = `/v2/admin/${locationSlug}/students/${student.id}`;
              const teacherPath = courseWithRelations.teacher
                ? `/v2/admin/${locationSlug}/teachers/${courseWithRelations.teacher.id}`
                : null;

              const logData = {
                logObjectId: logObject.id,
                logActivityId: logActivity.id,
                message,
                data: JSON.stringify(enrolmentData),
                locationId,
                createdUserId: loggedUserId,
                createdOn: new Date(),
              };

              const logLinkData = {
                index: studentName,
                baseUrl,
                path: studentPath,
              };

              const logHistoryData = {
                instanceId: student.id,
                instanceType: 'student',
              };

              // Create log, link, and history
              const { log: savedLog } = await this.logRepository.createLog(logData, logLinkData, logHistoryData);

              // Create second log link for teacher if available (legacy creates two links)
              if (teacherPath && courseWithRelations.teacher) {
                // Access the private logLinkRepository from LogRepository
                const logLinkRepo = (this.logRepository as any).logLinkRepository as Repository<LogLink>;
                if (logLinkRepo) {
                  const teacherLogLink = logLinkRepo.create({
                    logId: savedLog.id,
                    index: teacherName,
                    baseUrl,
                    path: teacherPath,
                  });
                  await logLinkRepo.save(teacherLogLink);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Log creation is non-critical, so we don't fail the enrolment confirmation
    }

    return {
      enrolmentId: enrolment.id,
    };
  }

  /**
   * Edit enrolment program rate, auto renew, and online status
   * POST /admin/v2/:location/enrolments/:id/edit-program-rate
   * Matches legacy: EnrolmentController::actionEditProgramRate()
   */
  async editProgramRate(
    locationId: number,
    enrolmentId: number,
    requestDto: EditProgramRateRequestDto,
    loggedUserId: number,
    locationSlug: string,
  ): Promise<{ message: string }> {
    // Get enrolment with relations
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'course.program', 'student', 'student.user', 'student.user.userLocation'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
      relations: ['program'],
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    // Store old values for downstream side effects and audit logging
    const oldIsAutoRenew = enrolment.isAutoRenew;
    const onlineChanged = requestDto.isOnline !== undefined;
    const nextOnlineValue = requestDto.isOnline ? 1 : 0;

    // Update enrolment fields
    if (requestDto.isAutoRenew !== undefined) {
      enrolment.isAutoRenew = requestDto.isAutoRenew ? 1 : 0;
    }

    if (onlineChanged) {
      enrolment.isOnline = nextOnlineValue;
    }

    enrolment.updatedByUserId = loggedUserId;
    await this.enrolmentEntityRepository.save(enrolment);

    if (onlineChanged) {
      course.isOnline = nextOnlineValue;
      course.updatedByUserId = loggedUserId;
      await this.courseRepository.save(course);

      await this.lessonRepository.update(
        {
          courseId: course.id,
          isDeleted: false,
        },
        {
          isOnline: nextOnlineValue === 1,
          updatedByUserId: loggedUserId,
          updatedOn: getCurrentESTDate(),
        },
      );
    }

    // Update course program rates if provided (matches legacy: foreach courseProgramRates)
    if (requestDto.courseProgramRates && requestDto.courseProgramRates.length > 0) {
      // Get all course program rates for this course (ordered by startDate ASC to match frontend order)
      const courseProgramRates = await this.courseProgramRateRepository.find({
        where: { courseId: course.id },
        order: { startDate: 'ASC' },
      });

      // Validate that the count matches (safety check)
      if (requestDto.courseProgramRates.length !== courseProgramRates.length) {
        throw new BadRequestException(
          `Rate count mismatch: received ${requestDto.courseProgramRates.length} rates, but found ${courseProgramRates.length} in database`
        );
      }

      // Update each rate by index (order must match: both sorted by startDate ASC)
      for (let i = 0; i < requestDto.courseProgramRates.length; i++) {
        const rateDto = requestDto.courseProgramRates[i];
        const courseProgramRate = courseProgramRates[i];
        
        if (courseProgramRate) {
          courseProgramRate.programRate = rateDto.programRate;
          await this.courseProgramRateRepository.save(courseProgramRate);
        }
      }
    } else if (requestDto.rate !== undefined) {
      // If single rate provided, update the first/current rate
      const courseProgramRate = await this.courseProgramRateRepository.findOne({
        where: { courseId: course.id },
        order: { startDate: 'DESC' },
      });

      if (courseProgramRate) {
        courseProgramRate.programRate = requestDto.rate;
        await this.courseProgramRateRepository.save(courseProgramRate);
      }
    }

    // Log auto renew change if it changed
    if (requestDto.isAutoRenew !== undefined && oldIsAutoRenew !== enrolment.isAutoRenew) {
      try {
        const loggedUser = await this.userRepository.findOne({
          where: { id: loggedUserId },
          relations: ['profile'],
        });

        if (!loggedUser) {
          throw new NotFoundException(`User not found: ${loggedUserId}`);
        }

        const autoRenewFeatureState = enrolment.isAutoRenew
          ? 'enabled'
          : 'disabled';

        const student = enrolment.student;
        const studentFullName = student
          ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
          : 'Unknown Student';

        const programName = course.program?.name || 'Unknown Program';

        const publicIdentity = loggedUser.profile
          ? `${loggedUser.profile.firstname || ''} ${loggedUser.profile.lastname || ''}`.trim()
          : `User ${loggedUserId}`;

        const message = `${publicIdentity} ${autoRenewFeatureState} Auto Renewal for {{${studentFullName}}}'s ${programName} enrolment`;

        // Get log object and activity
        const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.ENROLMENT);
        const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_UPDATE);

        if (!logObject || !logActivity) {
          throw new NotFoundException('Log object or activity not found');
        }

        // Get location ID from student's user location (matches legacy: $enrolmentModel->student->customer->userLocation->location_id)
        // Use the validated locationId from course, or fallback to student's user location
        let locationIdForLog = locationId;
        if (student?.user?.userLocation?.locationId) {
          locationIdForLog = student.user.userLocation.locationId;
        }

        // Create log entry
        const logData = {
          logObjectId: logObject.id,
          logActivityId: logActivity.id,
          message,
          data: JSON.stringify(enrolment),
          createdUserId: loggedUserId,
          locationId: locationIdForLog,
        };

        const studentIndex = studentFullName;
        const studentPath = `/v2/admin/${locationSlug}/students/${student.id}`;

        const logLinkData = {
          index: studentIndex,
          baseUrl: process.env.BASE_URL || 'http://localhost',
          path: studentPath,
        };

        const logHistoryData = {
          instanceId: enrolment.id,
          instanceType: LogObjectType.ENROLMENT,
        };

        await this.logRepository.createLog(logData, logLinkData, logHistoryData);
      } catch (error) {
        // Log creation is non-critical, so we don't fail the update
      }
    }

    return {
      message: 'Details successfully updated!',
    };
  }

  /**
   * Delete enrolment - deletes private enrolment and reverts lesson credits
   * Matches legacy: EnrolmentController::actionDelete()
   */
  async deleteEnrolment(
    locationId: number,
    enrolmentId: number,
    locationSlug: string,
    loggedUserId?: number,
  ): Promise<{ status: boolean; url?: string; message?: string }> {
    // Get enrolment with all necessary relations
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'course.program', 'student', 'student.user', 'student.user.profile'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
      relations: ['program'],
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    // Check if program is private and if enrolment can be deleted
    const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;
    if (!isPrivateProgram) {
      return {
        status: false,
      };
    }

    const isDraftEnrolment = !enrolment.isConfirmed && !enrolment.course?.isConfirmed;
    if (isDraftEnrolment) {
      await this.cancelDraftPrivateEnrolment(enrolment, locationId, loggedUserId);

      return {
        status: true,
        url: `/admin/${locationSlug}/enrolments`,
        message: 'Draft enrolment has been cancelled.',
      };
    }

    const canBeDeleted = await this.canBeDeleted(enrolmentId);

    if (!canBeDeleted) {
      return {
        status: false,
      };
    }

    // Get lessons that are confirmed and not canceled
    const lessons = await this.lessonRepository.find({
      where: {
        courseId: enrolment.courseId,
        isConfirmed: true,
        status: Not(LessonStatusEnum.CANCELED),
        isDeleted: false,
      },
      relations: ['course', 'course.enrolments', 'course.enrolments.student', 'course.enrolments.student.user'],
      order: {
        date: 'ASC',
      },
    });

    // Get customer ID once
    const customerId = enrolment.student?.user?.id;
    if (!customerId) {
      throw new NotFoundException('Customer not found for enrolment');
    }

    // Revert lessons credit (cancel and delete lessons without invoices)
    await this.revertLessonsCredit(lessons, enrolment.courseId, customerId);

    // Get customer public identity for message
    const customer = enrolment.student?.user;
    const customerPublicIdentity = customer?.profile
      ? `${customer.profile.firstname || ''} ${customer.profile.lastname || ''}`.trim() || `Customer ${customer.id}`
      : `Customer ${customer?.id || 'Unknown'}`;

    // Delete enrolment (soft delete)
    enrolment.isDeleted = true;
    await this.enrolmentEntityRepository.save(enrolment);

    // Update student and customer status
    await this.setStatus(enrolment.studentId);

    // Build redirect URL to enrolment listing page (new UI format)
    // Frontend route: /{location}/enrolments
    const url = `/admin/${locationSlug}/enrolments`;

    return {
      status: true,
      url,
      message: `Lesson credits has been credited to ${customerPublicIdentity} account.`,
    };
  }

  /**
   * Cancel a draft private enrolment bundle.
   * Draft bundles are created before confirmation, so cleanup can safely remove
   * the temporary course artifacts and soft-delete the customer/student records.
   */
  private async cancelDraftPrivateEnrolment(
    enrolment: Enrolment,
    locationId: number,
    loggedUserId?: number,
  ): Promise<void> {
    const course = enrolment.course;
    const student = enrolment.student;
    const customerId = student?.user?.id;

    if (!course || course.locationId !== locationId) {
      throw new NotFoundException('Course not found or does not belong to location');
    }

    if (!student) {
      throw new NotFoundException('Student not found for draft enrolment');
    }

    if (!customerId) {
      throw new NotFoundException('Customer not found for draft enrolment');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const courseId = course.id;
      const enrolmentId = enrolment.id;
      const now = new Date();
      const nowEpoch = Math.floor(now.getTime() / 1000);
      const auditUserId = loggedUserId ?? course.updatedByUserId ?? course.createdByUserId;
      const studentAuditUserId =
        loggedUserId ?? student.updatedByUserId ?? student.createdByUserId;

      await queryRunner.manager.delete(CourseSchedule, { courseId });
      await queryRunner.manager.delete(CourseProgramRate, { courseId });
      await queryRunner.manager.delete(EnrolmentDiscount, { enrolmentId });

      await queryRunner.manager.update(
        EnrolmentPaymentFrequency,
        { enrolmentId },
        { isDeleted: true },
      );

      await queryRunner.manager.update(
        Course,
        { id: courseId },
        {
          isDeleted: true,
          updatedByUserId: auditUserId,
        },
      );

      await queryRunner.manager.update(
        Enrolment,
        { id: enrolmentId },
        {
          isDeleted: true,
          updatedByUserId: auditUserId,
        },
      );

      await queryRunner.manager.update(
        Student,
        { id: student.id },
        {
          status: 2,
          isDeleted: 1,
          updatedOn: now,
          updatedByUserId: studentAuditUserId,
        },
      );

      await queryRunner.manager.update(
        User,
        { id: customerId },
        {
          status: User.STATUS_NOT_ACTIVE,
          isDeleted: true,
          updated_at: nowEpoch,
        },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if enrolment can be deleted
   * Matches legacy: Enrolment::canDeleted()
   * Returns true if there are no completed lessons (confirmed, not deleted, and
   * dated at or before the current timestamp).
   */
  private async canBeDeleted(enrolmentId: number): Promise<boolean> {
    const currentDateTime = getCurrentESTDate();

    // Match legacy exactly: compare the full timestamp, not just the date.
    // This allows deletion when the only remaining lesson is later today.
    const completedLessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('lesson.isDeleted = :lessonIsDeleted', { lessonIsDeleted: false })
      .andWhere('lesson.isConfirmed = :lessonIsConfirmed', { lessonIsConfirmed: true })
      .andWhere('lesson.date <= :currentDateTime', { currentDateTime })
      .getCount();

    return completedLessons === 0;
  }

  /**
   * Revert lessons credit - cancel and delete lessons that don't have invoices
   * Matches legacy: Invoiceable::revertLessonsCredit()
   * 
   * Optimized version to prevent timeouts:
   * - Batch check for invoices upfront
   * - Batch load private lessons
   * - Process lessons in order
   * - Update customer balance only once at the end
   * - Use transactions for atomicity
   */
  private async revertLessonsCredit(
    lessons: Lesson[],
    courseId: number,
    customerId: number,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lessonIds = lessons.map(l => l.id);

      // 1. Batch check for invoices upfront (one query instead of N queries)
      const lessonsWithInvoices = await this.invoiceItemLessonRepository
        .createQueryBuilder('iil')
        .innerJoin('iil.invoiceLineItem', 'ili')
        .innerJoin('ili.invoice', 'invoice')
        .where('iil.lessonId IN (:...lessonIds)', { lessonIds })
        .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: false })
        .select('iil.lessonId', 'lessonId')
        .getRawMany();

      const invoicedLessonIds = new Set(lessonsWithInvoices.map(item => item.lessonId));
      const lessonsToProcess = lessons.filter(l => !invoicedLessonIds.has(l.id));

      if (lessonsToProcess.length === 0) {
        await queryRunner.commitTransaction();
        return;
      }

      // 2. Batch load private lessons
      const privateLessons = await this.privateLessonRepository.find({
        where: { lessonId: In(lessonsToProcess.map(l => l.id)) },
      });
      const privateLessonMap = new Map(privateLessons.map(pl => [pl.lessonId, pl]));

      // 3. Process lessons in order (sorted by date)
      const sortedLessons = [...lessonsToProcess].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const lessonIdsToCancel: number[] = [];
      const lessonIdsToDelete: number[] = [];
      const privateLessonUpdates: Array<{ id: number; total: number; balance: number }> = [];

      for (const lesson of sortedLessons) {
        // 1. Cancel the lesson (status = CANCELED = 4)
        lessonIdsToCancel.push(lesson.id);

        // 2. Update private_lesson total and balance
        const privateLesson = privateLessonMap.get(lesson.id);
        if (privateLesson) {
          // Calculate netPrice = (programRate + tax) - discount
          const grossPrice = Number(lesson.programRate || 0) + Number(lesson.tax || 0);
          // TODO: Calculate discount from lesson discounts if needed
          const discount = 0;
          const netPrice = grossPrice - discount;
          const total = RoundingUtils.roundDecimal(netPrice, 2);
          const balance = total;

          privateLessonUpdates.push({
            id: privateLesson.id,
            total,
            balance,
          });
        }

        // 3. Mark lesson for deletion
        lessonIdsToDelete.push(lesson.id);
      }

      // Find next lesson for course startDate update (before canceling)
      // Get the first remaining lesson that's not being canceled or deleted
      const nextLesson = await queryRunner.manager.findOne(Lesson, {
        where: {
          courseId,
          id: Not(In(lessonIdsToCancel)), // Exclude lessons being canceled
          isConfirmed: true,
          status: Not(LessonStatusEnum.CANCELED),
          isDeleted: false,
        },
        order: {
          date: 'ASC',
        },
      });

      // Batch update: Cancel all lessons
      if (lessonIdsToCancel.length > 0) {
        await queryRunner.manager.update(
          Lesson,
          { id: In(lessonIdsToCancel) },
          { status: LessonStatusEnum.CANCELED },
        );
      }

      // Batch update: Update private lessons
      for (const update of privateLessonUpdates) {
        await queryRunner.manager.update(
          PrivateLesson,
          { id: update.id },
          { total: update.total, balance: update.balance },
        );
      }

      // Update course startDate to next lesson's date (if any)
      if (nextLesson) {
        await queryRunner.manager.update(
          Course,
          { id: courseId },
          { startDate: nextLesson.date },
        );
      }

      // Batch update: Soft delete all lessons
      if (lessonIdsToDelete.length > 0) {
        await queryRunner.manager.update(
          Lesson,
          { id: In(lessonIdsToDelete) },
          { isDeleted: true },
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // 5. Update customer account balance once at the end (expensive operation, do outside transaction)
      await this.lessonConfirmationService.updateCustomerBalance(customerId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if a lesson has an invoice
   * Matches legacy: Lesson::hasInvoice()
   */
  private async lessonHasInvoice(lessonId: number): Promise<boolean> {
    const invoiceItemLesson = await this.invoiceItemLessonRepository
      .createQueryBuilder('iil')
      .innerJoin('iil.invoiceLineItem', 'ili')
      .innerJoin('ili.invoice', 'invoice')
      .where('iil.lessonId = :lessonId', { lessonId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: false })
      .getOne();

    return invoiceItemLesson !== null;
  }

  /**
   * Update student and customer status based on active enrolments
   * Matches legacy: Enrolment::setStatus()
   */
  private async setStatus(studentId: number): Promise<void> {
    // Get student with all enrolments
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: ['enrolments', 'enrolments.course', 'user'],
    });

    if (!student) {
      return;
    }

    // Check if student has any active enrolments
    let hasActiveEnrolment = false;
    for (const enrolment of student.enrolments || []) {
      if (this.isEnrolmentActive(enrolment)) {
        hasActiveEnrolment = true;
        break;
      }
    }

    // Update student status (1 = Active, 2 = Inactive, matching legacy constants)
    const studentStatus = hasActiveEnrolment ? 1 : 2;
    await this.studentRepository.update(
      { id: studentId },
      {
        status: studentStatus,
        isDeleted: 0, // false
      },
    );

    // Update customer (user) status if user exists
    if (student.user) {
      const customerStatus = hasActiveEnrolment ? User.STATUS_ACTIVE : User.STATUS_NOT_ACTIVE;
      await this.userRepository.update(
        { id: student.user.id },
        {
          status: customerStatus,
          isDeleted: false,
        },
      );
    }
  }

  /**
   * Check if enrolment is active
   * Matches legacy: Enrolment::isActive()
   */
  private isEnrolmentActive(enrolment: Enrolment): boolean {
    if (enrolment.isDeleted || !enrolment.isConfirmed) {
      return false;
    }

    if (!enrolment.course) {
      return false;
    }

    const course = enrolment.course;
    if (course.isDeleted || !course.isConfirmed) {
      return false;
    }

    // Check if endDateTime is in the future
    if (enrolment.endDateTime) {
      const endDate = new Date(enrolment.endDateTime);
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      return endDate >= currentDate;
    }

    return false;
  }

  /**
   * Delete group enrolment - deletes group enrolment if no invoices or payments
   * Matches legacy: EnrolmentController::actionGroupEnrolmentDelete()
   */
  async deleteGroupEnrolment(
    locationId: number,
    enrolmentId: number,
    locationSlug: string,
  ): Promise<{ status: boolean; url?: string; message?: string; error?: string }> {
    // Get enrolment with all necessary relations
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'course.program'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
      relations: ['program'],
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    // Check if program is group
    const isGroupProgram = course.program?.type === Program.TYPE_GROUP_PROGRAM;

    if (!isGroupProgram) {
      return {
        status: false,
        error: 'This enrolment is not a group enrolment.',
      };
    }

    // Get lessons for this enrolment's course
    // Match legacy query 8: filters by isConfirmed=TRUE and status IN (1, 2, 5)
    // Status values: 1=RESCHEDULED, 2=SCHEDULED, 5=UNSCHEDULED
    const lessons = await this.lessonRepository.find({
      where: {
        courseId: enrolment.courseId,
        isDeleted: false,
        isConfirmed: true,
        status: In([
          LessonStatusEnum.RESCHEDULED,    // 1
          LessonStatusEnum.SCHEDULED,      // 2
          LessonStatusEnum.UNSCHEDULED,   // 5
        ]),
      },
    });

    // Check if any lesson has an invoice or if enrolment has payments
    // Match legacy logic exactly: foreach lesson, check hasInvoice(lessonId) OR hasPayment()
    let hasInvoiceOrPayment = false;

    // Check if enrolment has payments (checked once, but matches legacy hasPayment() call in loop)
    const enrolmentPayments = await this.lessonPaymentRepository.count({
      where: {
        enrolmentId: enrolmentId,
        isDeleted: 0, // 0 = not deleted, matches legacy onCondition(['lesson_payment.isDeleted' => false])
      },
    });

    const hasPayment = enrolmentPayments > 0;

    // If enrolment has payments, block deletion immediately (matches legacy)
    if (hasPayment) {
      hasInvoiceOrPayment = true;
    } else if (lessons.length > 0) {
      // Check for invoices on lessons - match legacy query structure exactly
      // Legacy: foreach lesson, check hasInvoice(lessonId)
      for (const lesson of lessons) {
        // Check if this specific lesson has an invoice for this enrolment
        // Match legacy getInvoice() method which uses enrolmentLesson scope:
        // invoice -> invoice_line_item -> invoice_item_lesson -> invoice_item_enrolment
        // Filters: invoice.type=2, invoice_item_lesson.lessonId=X, invoice_item_enrolment.enrolmentId=Y
        const invoiceCount = await this.invoiceItemLessonRepository
          .createQueryBuilder('iil')
          .innerJoin('iil.invoiceLineItem', 'ili')
          .innerJoin('ili.invoice', 'invoice')
          .innerJoin('invoice_item_enrolment', 'iie', 'iie.invoiceLineItemId = iil.invoiceLineItemId')
          .where('iil.lessonId = :lessonId', { lessonId: lesson.id })
          .andWhere('iie.enrolmentId = :enrolmentId', { enrolmentId: enrolmentId })
          .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: false })
          .andWhere('invoice.type = :invoiceType', { invoiceType: 2 }) // TYPE_INVOICE = 2
          .getCount();

        if (invoiceCount > 0) {
          hasInvoiceOrPayment = true;
          break; // Early exit if invoice found
        }
      }
    }

    if (hasInvoiceOrPayment) {
      return {
        status: false,
        error: 'Enrolment not deleted because it associated with invoice and payments.',
      };
    }

    // All checks passed - delete enrolment (soft delete)
    enrolment.isDeleted = true;
    await this.enrolmentEntityRepository.save(enrolment);

    // Update student and customer status
    await this.setStatus(enrolment.studentId);

    // Build redirect URL to enrolment listing page (new UI format)
    // Frontend route: /{location}/enrolments
    const url = `/admin/${locationSlug}/enrolments`;

    return {
      status: true,
      url,
      message: 'Enrolment has been deleted.',
    };
  }

  /**
   * Get delete preview - shows what will be deleted when deleting an enrolment
   * GET /admin/v2/:location/enrolments/:id/delete-preview
   * Matches legacy: EnrolmentController::actionFullDelete() (GET request)
   */
  async getDeletePreview(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentDeletePreviewResponseDto> {
    // Get enrolment with course
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'course.program'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
      relations: ['program'],
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    // Check if program is private (only private enrolments can be fully deleted)
    const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

    if (!isPrivateProgram) {
      throw new BadRequestException('Delete preview is only available for private enrolments');
    }

    // Format date range (course startDate to endDate)
    // Match legacy: Carbon::parse() parses date strings directly without timezone conversion
    // First, get raw course dates to check if they exist and are valid
    const courseWithDates = await this.courseRepository.findOne({
      where: { id: course.id },
      select: ['id', 'startDate', 'endDate'],
    });

    // Check if dates are valid (not null and not Invalid Date)
    // Issue: Some courses may have NULL or invalid startDate but valid endDate
    // Fix: Validate dates before formatting and handle cases where only one date exists
    const isValidDate = (date: any): boolean => {
      if (!date) return false;
      const d = new Date(date);
      return !isNaN(d.getTime());
    };

    const hasStartDate = isValidDate(courseWithDates?.startDate);
    const hasEndDate = isValidDate(courseWithDates?.endDate);

    let dateRange = '';
    
    // Use raw SQL DATE_FORMAT to get dates exactly as Carbon sees them (no timezone conversion)
    // Only format dates that are valid (not NULL) to avoid MySQL returning NULL
    const dateSelects: string[] = [];
    if (hasStartDate) {
      dateSelects.push("DATE_FORMAT(course.startDate, '%b %d, %Y') as startDateFormatted");
    }
    if (hasEndDate) {
      dateSelects.push("DATE_FORMAT(course.endDate, '%b %d, %Y') as endDateFormatted");
    }

    if (dateSelects.length > 0) {
      const courseDates = await this.courseRepository
        .createQueryBuilder('course')
        .where('course.id = :courseId', { courseId: course.id })
        .select(dateSelects)
        .getRawOne();

      // Handle MySQL NULL values (they come as null, not undefined)
      const startDateFormatted = courseDates?.startDateFormatted && courseDates.startDateFormatted !== null ? courseDates.startDateFormatted : null;
      const endDateFormatted = courseDates?.endDateFormatted && courseDates.endDateFormatted !== null ? courseDates.endDateFormatted : null;

      if (startDateFormatted && endDateFormatted) {
        // Both dates exist and are formatted
        dateRange = `${startDateFormatted} - ${endDateFormatted}`;
      } else if (startDateFormatted) {
        // Only startDate exists
        dateRange = startDateFormatted;
      } else if (endDateFormatted) {
        // Only endDate exists (handle case where startDate is invalid/null)
        dateRange = endDateFormatted;
      }
    }

    // Create preview items (objects that will be deleted)
    const objects = ['Lessons', 'Payment Cycles', 'PFIs', 'Invoices'];
    const previewItems: DeletePreviewItemDto[] = objects.map((obj) => ({
      objects: obj,
      action: 'will be deleted',
      date_range: dateRange ? `within ${dateRange}` : '',
    }));

    // Get payments to be deleted
    // Match legacy EnrolmentPaymentSearch: UNION of two queries
    // 1. Payments via regular invoices (type=2) -> invoice_line_item -> invoice_item_lesson -> lesson -> course -> enrolment
    // 2. Payments via proforma invoices (type=1) -> invoice_line_item -> invoice_item_payment_cycle_lesson -> payment_cycle_lesson -> payment_cycle -> enrolment
    
    // Query 1: Payments via regular invoices (type=2)
    // Match legacy: payment -> invoice_payment -> invoice (type=2) -> invoice_line_item -> invoice_item_lesson -> lesson -> course -> enrolment
    const regularInvoicePayments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('user', 'user', 'user.id = payment.user_id')
      .leftJoin('user_location', 'ul', 'ul.user_id = user.id')
      .leftJoin('invoice_payment', 'ip', 'ip.payment_id = payment.id')
      .leftJoin('invoice', 'invoice', 'ip.invoice_id = invoice.id')
      .leftJoin('invoice_line_item', 'ili', 'ili.invoice_id = invoice.id AND ili.isDeleted = 0')
      .leftJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = ili.id')
      .leftJoin('lesson', 'lesson', 'iil.lessonId = lesson.id')
      .leftJoin('course', 'course', 'lesson.courseId = course.id AND course.isDeleted = 0')
      .leftJoin('enrolment', 'enrolment', 'course.id = enrolment.courseId AND enrolment.isDeleted = 0')
      .where('payment.isDeleted = 0')
      .andWhere('ul.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 }) // TYPE_INVOICE = 2
      .andWhere('enrolment.id = :enrolmentId', { enrolmentId })
      .select([
        'payment.id as payment_id',
      ])
      .getRawMany();

    // Query 2: Payments via proforma invoices (type=1) via payment cycles
    // Match legacy: payment -> invoice_payment -> invoice (type=1) -> invoice_line_item -> invoice_item_payment_cycle_lesson -> payment_cycle_lesson -> payment_cycle -> enrolment
    const proformaInvoicePayments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('user', 'user', 'user.id = payment.user_id')
      .leftJoin('user_location', 'ul', 'ul.user_id = user.id')
      .leftJoin('invoice_payment', 'ip', 'ip.payment_id = payment.id')
      .leftJoin('invoice', 'invoice', 'ip.invoice_id = invoice.id')
      .leftJoin('invoice_line_item', 'ili', 'ili.invoice_id = invoice.id AND ili.isDeleted = 0')
      .leftJoin('invoice_item_payment_cycle_lesson', 'iipcl', 'iipcl.invoiceLineItemId = ili.id')
      .leftJoin('payment_cycle_lesson', 'pcl', 'iipcl.paymentCycleLessonId = pcl.id')
      .leftJoin('payment_cycle', 'pc', 'pcl.paymentCycleId = pc.id')
      .leftJoin('enrolment', 'enrolment', 'pc.enrolmentId = enrolment.id')
      .where('payment.isDeleted = 0')
      .andWhere('ul.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :invoiceType', { invoiceType: 1 }) // TYPE_PRO_FORMA_INVOICE = 1
      .andWhere('enrolment.id = :enrolmentId', { enrolmentId })
      .select([
        'payment.id as payment_id',
      ])
      .getRawMany();

    // Combine and deduplicate payment IDs
    const allPaymentIds = new Set([
      ...regularInvoicePayments.map(p => p.payment_id),
      ...proformaInvoicePayments.map(p => p.payment_id),
    ]);

    // Get payment details with payment method
    // Note: getRawMany() returns field names with table alias prefix (e.g., payment_amount)
    const payments = allPaymentIds.size > 0
      ? await this.paymentRepository
          .createQueryBuilder('payment')
          .leftJoin('payment_method', 'pm', 'pm.id = payment.payment_method_id')
          .where('payment.id IN (:...paymentIds)', { paymentIds: Array.from(allPaymentIds) })
          .select([
            'payment.amount as payment_amount',
            'payment.reference as payment_reference',
            'pm.name as paymentMethodName',
          ])
          .getRawMany()
      : [];

    const paymentDtos: DeletePreviewPaymentDto[] = payments.map((p) => ({
      amount: Number(p.payment_amount || 0),
      type: p.paymentMethodName || 'Unknown',
      reference: p.payment_reference || null,
    }));

    return {
      previewItems,
      payments: paymentDtos,
      dateRange,
    };
  }

  /**
   * Validate discount edit - checks if discount editing is allowed
   * Matches legacy: Enrolment::validateOnEdit()
   */
  private async validateDiscountEdit(
    queryRunner: any,
    enrolment: Enrolment,
    course: Course,
    isPrivateProgram: boolean,
  ): Promise<PrivateDiscountCycleRange | undefined> {
    if (isPrivateProgram) {
      const privateDiscountCycleRange = await this.getPrivateDiscountCycleRange(queryRunner, enrolment, course);

      if (!privateDiscountCycleRange) {
        throw new BadRequestException("You can't edit discounts.");
      }

      return privateDiscountCycleRange;
    } else {
      // For group enrolments: must not have paid lessons
      // Match legacy: hasPaidLesson() - checks if any lesson in lessonsByDate has a LessonPayment
      // lessonsByDate includes lessons with status IN (RESCHEDULED, SCHEDULED, UNSCHEDULED)
      // Optimized: Use EXISTS pattern with limit 1 for better performance
      const hasPaidLesson = await queryRunner.manager
        .createQueryBuilder(Lesson, 'lesson')
        .innerJoin('lesson_payment', 'lp', 'lp.lessonId = lesson.id AND lp.enrolmentId = :enrolmentId AND lp.isDeleted = 0', { enrolmentId: enrolment.id })
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status IN (:...statuses)', { 
          statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] 
        })
        .select('1', 'exists')
        .limit(1)
        .getRawOne();

      if (hasPaidLesson) {
        throw new BadRequestException("You can't edit discounts.");
      }

      return undefined;
    }
  }

  /**
   * Get the legacy private discount cycle range.
   * Matches legacy: partialyPaidPaymentCycle->startDate through lastPaymentCycle->endDate
   */
  private async getPrivateDiscountCycleRange(
    queryRunner: any,
    enrolment: Enrolment,
    course: Course,
  ): Promise<PrivateDiscountCycleRange | null> {
    const paymentCycles = await queryRunner.manager.find(PaymentCycle, {
      where: { enrolmentId: enrolment.id, isDeleted: 0 },
      order: { startDate: 'ASC' },
    });

    if (paymentCycles.length === 0) {
      return null;
    }

    const lastPaymentCycle = paymentCycles.reduce((latest, current) => {
      if (!latest) {
        return current;
      }

      return new Date(current.endDate) > new Date(latest.endDate) ? current : latest;
    }, paymentCycles[0]);

    for (const paymentCycle of paymentCycles) {
      const hasInvoiced = await queryRunner.manager
        .createQueryBuilder(Lesson, 'lesson')
        .leftJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
        .leftJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
        .leftJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
        .andWhere('lesson.date >= :startDate', { startDate: paymentCycle.startDate })
        .andWhere('lesson.date <= :endDate', { endDate: paymentCycle.endDate })
        .andWhere('inv.id IS NOT NULL')
        .select('1', 'exists')
        .limit(1)
        .getRawOne();

      if (hasInvoiced) {
        continue;
      }

      const hasLessonsInCycle = await queryRunner.manager
        .createQueryBuilder(Lesson, 'lesson')
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
        .andWhere('lesson.date >= :startDate', { startDate: paymentCycle.startDate })
        .andWhere('lesson.date <= :endDate', { endDate: paymentCycle.endDate })
        .select('1', 'exists')
        .limit(1)
        .getRawOne();

      if (!hasLessonsInCycle) {
        return {
          startDate: new Date(paymentCycle.startDate),
          endDate: new Date(lastPaymentCycle.endDate),
        };
      }

      const [hasUnpaidLessons, hasPartialPayment] = await Promise.all([
        queryRunner.manager
          .createQueryBuilder(Lesson, 'lesson')
          .leftJoin('private_lesson', 'pl', 'pl.lessonId = lesson.id')
          .where('lesson.courseId = :courseId', { courseId: course.id })
          .andWhere('lesson.isDeleted = 0')
          .andWhere('lesson.isConfirmed = 1')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
          .andWhere('lesson.date >= :startDate', { startDate: paymentCycle.startDate })
          .andWhere('lesson.date <= :endDate', { endDate: paymentCycle.endDate })
          .andWhere('ROUND(pl.balance, 2) != 0.00')
          .select('1', 'exists')
          .limit(1)
          .getRawOne(),
        queryRunner.manager
          .createQueryBuilder(Lesson, 'lesson')
          .innerJoin(
            'lesson_payment',
            'lp',
            'lp.lessonId = lesson.id AND lp.enrolmentId = :enrolmentId AND lp.isDeleted = 0',
            { enrolmentId: enrolment.id },
          )
          .where('lesson.courseId = :courseId', { courseId: course.id })
          .andWhere('lesson.isDeleted = 0')
          .andWhere('lesson.isConfirmed = 1')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
          .andWhere('lesson.date >= :startDate', { startDate: paymentCycle.startDate })
          .andWhere('lesson.date <= :endDate', { endDate: paymentCycle.endDate })
          .select('1', 'exists')
          .limit(1)
          .getRawOne(),
      ]);

      if (hasUnpaidLessons || hasPartialPayment) {
        return {
          startDate: new Date(paymentCycle.startDate),
          endDate: new Date(lastPaymentCycle.endDate),
        };
      }
    }

    return null;
  }

  /**
   * Get discount preview - shows what will be modified when editing enrolment discounts
   * GET /admin/v2/:location/enrolments/:id/discount-preview
   * Matches legacy: Enrolment::getPreviewDataProvider()
   */
  async getDiscountPreview(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentDiscountPreviewResponseDto> {
    // Get enrolment with course and program
    const enrolment = await this.enrolmentEntityRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course', 'course.program'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }

    // Verify enrolment belongs to this location
    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
      relations: ['program'],
    });

    if (!course) {
      throw new NotFoundException(`Course not found or does not belong to location`);
    }

    const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

    // Validation: Match legacy validateOnEdit() - check if editing is allowed
    // Use a temporary query runner for validation (read-only check)
    const tempQueryRunner = this.dataSource.createQueryRunner();
    await tempQueryRunner.connect();
    let privateDiscountCycleRange: PrivateDiscountCycleRange | undefined;
    try {
      privateDiscountCycleRange = await this.validateDiscountEdit(
        tempQueryRunner,
        enrolment,
        course,
        isPrivateProgram,
      );
    } catch (error) {
      throw error; // Re-throw validation error
    } finally {
      await tempQueryRunner.release();
    }
    let dateRange = '';

    if (isPrivateProgram) {
      // For private enrolments: use the affected payment cycle window
      // Match legacy: $this->partialyPaidPaymentCycle->startDate and $this->lastPaymentCycle->endDate
      if (privateDiscountCycleRange) {
        dateRange = `${formatDate(privateDiscountCycleRange.startDate)} - ${formatDate(privateDiscountCycleRange.endDate)}`;
      }
    } else {
      // For group enrolments: use lesson dates
      // Get firstUnpaidLesson and lastLesson dates in optimized queries
      // Match legacy: $this->firstUnpaidLesson->date and $this->lastLesson->date
      
      // Get first unpaid lesson date (first lesson without a LessonPayment)
      const firstUnpaidDate = await this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoin('lesson_payment', 'lp', 'lp.lessonId = lesson.id AND lp.enrolmentId = :enrolmentId AND lp.isDeleted = 0', { enrolmentId })
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status IN (:...statuses)', { statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] })
        .andWhere('lp.id IS NULL')
        .orderBy('lesson.date', 'ASC')
        .select("DATE_FORMAT(lesson.date, '%b %d, %Y')", 'formattedDate')
        .limit(1)
        .getRawOne();

      // Get last lesson date (last lesson with status IN (1,2,5))
      const lastLessonDate = await this.lessonRepository
        .createQueryBuilder('lesson')
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status IN (:...statuses)', { statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] })
        .orderBy('lesson.date', 'DESC')
        .select("DATE_FORMAT(lesson.date, '%b %d, %Y')", 'formattedDate')
        .limit(1)
        .getRawOne();

      const startDate = firstUnpaidDate?.formattedDate;
      const endDate = lastLessonDate?.formattedDate;

      if (startDate && endDate) {
        dateRange = `${startDate} - ${endDate}`;
      }
    }

    // Create preview items
    // Match legacy: always includes "Lesson's Discount"
    const previewItems: DiscountPreviewItemDto[] = [
      {
        objects: "Lesson's Discount",
        action: 'will be modified',
        date_range: dateRange ? `within ${dateRange}` : '',
        class: 'lesson-discount',
      },
    ];

    return {
      previewItems,
    };
  }

  /**
   * Update enrolment discounts - updates payment frequency and multiple enrolment discounts
   * POST /admin/v2/:location/enrolments/:id/discounts
   * Matches legacy: EnrolmentController::actionEdit() (POST request)
   */
  async updateEnrolmentDiscounts(
    locationId: number,
    locationSlug: string,
    enrolmentId: number,
    data: UpdateEnrolmentDiscountsRequestDto,
    loggedUserId: number,
  ): Promise<{ status: boolean; message?: string }> {
    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId: loggedUserId,
    };

    try {
      // Get enrolment with course, program, and student
      const enrolment = await queryRunner.manager.findOne(Enrolment, {
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program', 'student'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify enrolment belongs to this location
      const course = await queryRunner.manager.findOne(Course, {
        where: { id: enrolment.courseId, locationId },
        relations: ['program'],
      });

      if (!course) {
        throw new NotFoundException(`Course not found or does not belong to location`);
      }

      const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

      // Only handle private enrolments in this method
      if (!isPrivateProgram) {
        throw new BadRequestException('This endpoint is for private enrolment discounts only. Use the group enrolment discount endpoint for group enrolments.');
      }

      // Validation: Match legacy validateOnEdit()
      const privateDiscountCycleRange = await this.validateDiscountEdit(
        queryRunner,
        enrolment,
        course,
        isPrivateProgram,
      );

      // Get existing discounts for private enrolments
      const existingPfDiscount = await queryRunner.manager.findOne(EnrolmentDiscount, {
        where: {
          enrolmentId,
          type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
        },
      });

      const existingMultiDiscount = await queryRunner.manager.findOne(EnrolmentDiscount, {
        where: {
          enrolmentId,
          type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
        },
      });

      // Store old values for logging
      // Match legacy: $oldMultipleEnrolmentDiscountValue = $model->getMultipleEnrolmentDiscountValue();
      // getMultipleEnrolmentDiscountValue() returns "Not set" (string) if discount doesn't exist, or "$5" (string) if it does
      // getPaymentFrequencyDiscountValue() returns "Not set" (string) if discount doesn't exist, or "5%" (string) if it does
      // These formatted strings are passed to the log function
      const oldPfDiscountValue = existingPfDiscount?.discount ?? null;
      const oldMultiDiscountValue = existingMultiDiscount?.discount ?? null;
      
      // Format old values to match getValue() methods
      // Match legacy: getPaymentFrequencyDiscountValue() returns "Not set" or "5%"
      const oldPfDiscountDisplay = oldPfDiscountValue === null || oldPfDiscountValue === undefined 
        ? 'Not set' 
        : `${oldPfDiscountValue}%`;
      // Match legacy: getMultipleEnrolmentDiscountValue() returns "Not set" or "$5"
      const oldMultiDiscountDisplay = oldMultiDiscountValue === null || oldMultiDiscountValue === undefined 
        ? 'Not set' 
        : `$${oldMultiDiscountValue}`;

      // Update or create Payment Frequency Discount
      // Match legacy: always save, even if discount is NULL/0
      let pfDiscountChanged = false;
      let newPfDiscountValue: number | null = null;
      
      if (data.pfDiscount !== undefined) {
        // Parse discount value - allow NULL/empty string to be null
        if (data.pfDiscount && data.pfDiscount.trim() !== '') {
          const parsed = parseFloat(data.pfDiscount);
          newPfDiscountValue = isNaN(parsed) ? null : parsed;
        } else {
          newPfDiscountValue = null;
        }

        if (existingPfDiscount) {
          // Normalize legacy/inverted metadata whenever this discount is edited.
          const oldValue = existingPfDiscount.discount ?? null;
          const valueChanged = oldValue !== newPfDiscountValue;
          const valueTypeChanged =
            existingPfDiscount.discountType !== EnrolmentDiscount.VALUE_TYPE_PERCENTAGE;
          if (valueChanged || valueTypeChanged) {
            existingPfDiscount.discount = newPfDiscountValue;
            existingPfDiscount.discountType = EnrolmentDiscount.VALUE_TYPE_PERCENTAGE;
            await queryRunner.manager.save(existingPfDiscount);
            pfDiscountChanged = valueChanged;
          }
        } else {
          // Always create, even if value is null
          const newPfDiscount = queryRunner.manager.create(EnrolmentDiscount, {
            enrolmentId,
            discount: newPfDiscountValue,
            discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
            type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
          });
          await queryRunner.manager.save(newPfDiscount);
          pfDiscountChanged = true;
        }
      }

      // Update or create Multiple Enrolment Discount
      // Match legacy: always save, even if discount is NULL/0
      let multiDiscountChanged = false;
      let newMultiDiscountValue: number | null = null;
      
      if (data.multipleEnrolDiscount !== undefined) {
        // Parse discount value - allow NULL/empty string to be null
        if (data.multipleEnrolDiscount && data.multipleEnrolDiscount.trim() !== '') {
          const parsed = parseFloat(data.multipleEnrolDiscount);
          newMultiDiscountValue = isNaN(parsed) ? null : parsed;
        } else {
          newMultiDiscountValue = null;
        }

        if (existingMultiDiscount) {
          // Normalize legacy/inverted metadata whenever this discount is edited.
          const oldValue = existingMultiDiscount.discount ?? null;
          const valueChanged = oldValue !== newMultiDiscountValue;
          const valueTypeChanged =
            existingMultiDiscount.discountType !== EnrolmentDiscount.VALUE_TYPE_DOLLAR;
          if (valueChanged || valueTypeChanged) {
            existingMultiDiscount.discount = newMultiDiscountValue;
            existingMultiDiscount.discountType = EnrolmentDiscount.VALUE_TYPE_DOLLAR;
            await queryRunner.manager.save(existingMultiDiscount);
            multiDiscountChanged = valueChanged;
          }
        } else {
          // Always create, even if value is null
          const newMultiDiscount = queryRunner.manager.create(EnrolmentDiscount, {
            enrolmentId,
            discount: newMultiDiscountValue,
            discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
            type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
          });
          await queryRunner.manager.save(newMultiDiscount);
          multiDiscountChanged = true;
        }
      }

      // Get logged user for logging
      const loggedUser = await queryRunner.manager.findOne(User, {
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      if (!loggedUser) {
        throw new NotFoundException(`User not found: ${loggedUserId}`);
      }

      // If discounts changed, reset lesson discounts and log changes
      // Match legacy: call resetDiscount with 0.0 if discount is null/empty
      if (pfDiscountChanged) {
        const resetValue = newPfDiscountValue ?? 0.0;
        await this.resetDiscount(
          queryRunner,
          enrolment,
          course,
          EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
          resetValue,
          privateDiscountCycleRange,
        );
        await this.logDiscountChange(
          queryRunner,
          enrolment,
          loggedUser,
          'Payment Frequency Discount',
          oldPfDiscountDisplay,
          newPfDiscountValue ?? 0,
          locationId,
          locationSlug,
        );
      }

      if (multiDiscountChanged) {
        const resetValue = newMultiDiscountValue ?? 0.0;
        await this.resetDiscount(
          queryRunner,
          enrolment,
          course,
          EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
          resetValue,
          privateDiscountCycleRange,
        );
        await this.logDiscountChange(
          queryRunner,
          enrolment,
          loggedUser,
          'Multiple Enrolment Discount',
          oldMultiDiscountDisplay,
          newMultiDiscountValue ?? 0,
          locationId,
          locationSlug,
        );
      }

      // Save enrolment (triggers any after update events)
      await queryRunner.manager.save(enrolment);

      await queryRunner.commitTransaction();

      return {
        status: true,
        message: 'Discounts updated successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update group enrolment discount - handles discount and discountType for group enrolments
   * Matches legacy: GroupEnrolmentController::actionEditDiscount() (POST request)
   */
  async updateGroupEnrolmentDiscount(
    locationId: number,
    locationSlug: string,
    enrolmentId: number,
    data: UpdateGroupEnrolmentDiscountRequestDto,
    loggedUserId: number,
  ): Promise<{ status: boolean; message?: string }> {
    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId: loggedUserId,
    };

    try {
      // Get enrolment with course, program, and student
      const enrolment = await queryRunner.manager.findOne(Enrolment, {
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program', 'student'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify enrolment belongs to this location
      const course = await queryRunner.manager.findOne(Course, {
        where: { id: enrolment.courseId, locationId },
        relations: ['program'],
      });

      if (!course) {
        throw new NotFoundException(`Course not found or does not belong to location`);
      }

      const isGroupProgram = course.program?.type === Program.TYPE_GROUP_PROGRAM;

      // Only handle group enrolments
      if (!isGroupProgram) {
        throw new BadRequestException('This endpoint is for group enrolment discounts only. Use the private enrolment discount endpoint for private enrolments.');
      }

      // Validation: Match legacy validateOnEdit()
      await this.validateDiscountEdit(queryRunner, enrolment, course, false);

      // Get existing group discount
      const existingGroupDiscount = await queryRunner.manager.findOne(EnrolmentDiscount, {
        where: {
          enrolmentId,
          type: EnrolmentDiscount.TYPE_GROUP,
        },
      });

      // Parse discount value
      // If discount is provided in payload (even "0"), always apply it
      let newDiscountValue: number | null = null;
      if (data.discount !== undefined && data.discount !== null) {
        const trimmed = String(data.discount).trim();
        if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
          newDiscountValue = null;
        } else {
          const parsed = parseFloat(trimmed);
          // If it's a valid number (including 0), use it; otherwise null
          newDiscountValue = isNaN(parsed) ? null : parsed;
        }
      }

      const newDiscountType = data.discountType ?? EnrolmentDiscount.VALUE_TYPE_DOLLAR;

      // Format old value for logging - match legacy getGroupDiscountValue()
      let oldDiscountDisplay = 'Not set';
      if (existingGroupDiscount) {
        const oldValue = existingGroupDiscount.discount ?? null;
        if (oldValue !== null && oldValue !== undefined) {
          if (existingGroupDiscount.discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR) {
            oldDiscountDisplay = `$${oldValue}`;
          } else {
            oldDiscountDisplay = `${oldValue}%`;
          }
        }
      }

      // Format new value for logging
      let newDiscountDisplay = 'Not set';
      if (newDiscountValue !== null && newDiscountValue !== undefined) {
        if (newDiscountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR) {
          newDiscountDisplay = `$${newDiscountValue}`;
        } else {
          newDiscountDisplay = `${newDiscountValue}%`;
        }
      }

      // Check if discount changed
      // If discount is provided in payload, always process it (even if value is 0)
      const existingDiscountValue = existingGroupDiscount?.discount ?? null;
      const existingDiscountType = existingGroupDiscount?.discountType ?? null;
      
      // If discount was provided in payload, always update (even if it's 0 to reset)
      const discountProvided = data.discount !== undefined && data.discount !== null;
      
      // Compare values
      const valueChanged = existingDiscountValue !== newDiscountValue;
      const typeChanged = existingDiscountType !== newDiscountType;
      
      // Always process if discount was provided in payload OR if values actually changed
      const discountChanged = discountProvided || !existingGroupDiscount || valueChanged || typeChanged;

      if (discountChanged) {
        if (existingGroupDiscount) {
          existingGroupDiscount.discount = newDiscountValue;
          existingGroupDiscount.discountType = newDiscountType;
          await queryRunner.manager.save(existingGroupDiscount);
        } else {
          const newGroupDiscount = queryRunner.manager.create(EnrolmentDiscount, {
            enrolmentId,
            discount: newDiscountValue,
            discountType: newDiscountType,
            type: EnrolmentDiscount.TYPE_GROUP,
          });
          await queryRunner.manager.save(newGroupDiscount);
        }

        // Reset group discount - recalculate lesson discounts
        await this.resetGroupDiscount(queryRunner, enrolment, course);

        // Log discount change
        const loggedUser = await queryRunner.manager.findOne(User, {
          where: { id: loggedUserId },
          relations: ['profile'],
        });

        if (!loggedUser) {
          throw new NotFoundException(`User not found: ${loggedUserId}`);
        }

        // Parse newDiscountDisplay to number for logging
        const newDiscountValueForLog: number = newDiscountValue !== null && newDiscountValue !== undefined ? newDiscountValue : 0;

        await this.logDiscountChange(
          queryRunner,
          enrolment,
          loggedUser,
          'Group Discount',
          oldDiscountDisplay,
          newDiscountValueForLog,
          locationId,
          locationSlug,
        );
      }

      await queryRunner.manager.save(enrolment);
      await queryRunner.commitTransaction();

      return {
        status: true,
        message: 'Group discount updated successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Reset group discount - recalculates lesson discounts for group enrolments
   * Matches legacy: Enrolment::resetGroupDiscount()
   */
  private async resetGroupDiscount(
    queryRunner: any,
    enrolment: Enrolment,
    course: Course,
  ): Promise<void> {
    // Get group discount
    const groupDiscount = await queryRunner.manager.findOne(EnrolmentDiscount, {
      where: {
        enrolmentId: enrolment.id,
        type: EnrolmentDiscount.TYPE_GROUP,
      },
    });

    if (!groupDiscount || !groupDiscount.discount || groupDiscount.discount <= 0) {
      // Delete all group lesson discounts if no discount
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(LessonDiscount)
        .where('enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
        .andWhere('type = :type', { type: 5 }) // TYPE_GROUP = 5
        .execute();

      // Recalculate GroupLesson totals and balances (remove discount from prices)
      // Get all group lessons for this enrolment
      const groupLessons = await queryRunner.manager.find(GroupLesson, {
        where: {
          enrolmentId: enrolment.id,
          isDeleted: false,
        },
        relations: ['lesson'],
      });

      if (groupLessons.length > 0) {
        const lessonIds = groupLessons.map((gl) => gl.lessonId);

        // Batch load all credit amounts
        const creditAmountsResult = await queryRunner.manager
          .createQueryBuilder('lesson_payment', 'lp')
          .select('lp.lessonId', 'lessonId')
          .addSelect('COALESCE(SUM(lp.amount), 0)', 'creditAmount')
          .where('lp.lessonId IN (:...lessonIds)', { lessonIds })
          .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
          .andWhere('lp.isDeleted = 0')
          .groupBy('lp.lessonId')
          .getRawMany();

        const creditAmountMap = new Map<number, number>();
        creditAmountsResult.forEach((row) => {
          creditAmountMap.set(row.lessonId, Number(row.creditAmount || 0));
        });

        // Recalculate each group lesson (grossPrice without discount)
        const groupLessonsToSave: GroupLesson[] = [];
        for (const groupLesson of groupLessons) {
          if (groupLesson.lesson) {
            // Calculate gross price: programRate + tax (no discount)
            const grossPrice = Number(groupLesson.lesson.programRate || 0) + Number(groupLesson.lesson.tax || 0);
            const total = grossPrice; // No discount applied
            const creditAppliedAmount = creditAmountMap.get(groupLesson.lessonId) || 0;
            const balance = RoundingUtils.roundDecimal(total - creditAppliedAmount, 2);

            groupLesson.total = total;
            groupLesson.balance = balance;

            // Update paidStatus based on balance
            if (balance === 0) {
              groupLesson.paidStatus = GroupLesson.STATUS_PAID;
            } else if (balance > 0) {
              groupLesson.paidStatus = GroupLesson.STATUS_OWING;
            } else if (balance < 0) {
              groupLesson.paidStatus = GroupLesson.STATUS_CREDIT;
            }

            groupLessonsToSave.push(groupLesson);
          }
        }

        // Batch save updated group lessons
        if (groupLessonsToSave.length > 0) {
          await queryRunner.manager.save(GroupLesson, groupLessonsToSave);
        }
      }

      return;
    }

    const discountValue = groupDiscount.discount;
    const discountType = groupDiscount.discountType;

    // Get first unpaid lesson and last lesson dates
    // Match legacy: $fromDate = $this->firstUnpaidLesson->date, $toDate = $this->lastLesson->date
    // Optimize: Get both dates in parallel and use MIN/MAX for better performance
    const [firstUnpaidLessonResult, lastLessonResult] = await Promise.all([
      // Get first unpaid lesson date
      queryRunner.manager
        .createQueryBuilder(Lesson, 'lesson')
        .leftJoin('lesson_payment', 'lp', 'lp.lessonId = lesson.id AND lp.enrolmentId = :enrolmentId AND lp.isDeleted = 0', { enrolmentId: enrolment.id })
        .leftJoin('group_lesson', 'gl', 'gl.lessonId = lesson.id AND gl.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status IN (:...statuses)', { 
          statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] 
        })
        .andWhere('lp.id IS NULL')
        .andWhere('gl.id IS NOT NULL')
        .select('MIN(lesson.date)', 'date')
        .getRawOne(),
      // Get last lesson date
      queryRunner.manager
        .createQueryBuilder(Lesson, 'lesson')
        .leftJoin('group_lesson', 'gl', 'gl.lessonId = lesson.id AND gl.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
        .where('lesson.courseId = :courseId', { courseId: course.id })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status IN (:...statuses)', { 
          statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] 
        })
        .andWhere('gl.id IS NOT NULL')
        .select('MAX(lesson.date)', 'date')
        .getRawOne(),
    ]);

    const firstUnpaidLessonDate = firstUnpaidLessonResult?.date;
    const lastLessonDate = lastLessonResult?.date;

    if (!firstUnpaidLessonDate || !lastLessonDate) {
      return;
    }

    // Get all lessons between first unpaid and last lesson
    // Match legacy: Lesson::find()->between($fromDate, $toDate)->isConfirmed()->notCanceled()
    // Select programRate and tax fields needed for calculation
    const lessons = await queryRunner.manager
      .createQueryBuilder(Lesson, 'lesson')
      .leftJoin('group_lesson', 'gl', 'gl.lessonId = lesson.id AND gl.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
      .where('lesson.courseId = :courseId', { courseId: course.id })
      .andWhere('lesson.isDeleted = 0')
      .andWhere('lesson.isConfirmed = 1')
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED, LessonStatusEnum.UNSCHEDULED] 
      })
      .andWhere('lesson.date >= :fromDate', { fromDate: firstUnpaidLessonDate })
      .andWhere('lesson.date <= :toDate', { toDate: lastLessonDate })
      .andWhere('gl.id IS NOT NULL')
      .select([
        'lesson.id',
        'lesson.programRate',
        'lesson.tax',
        'lesson.date',
      ])
      .getMany();

    // Get total lesson count for dollar discount calculation
    const totalLessonCount = lessons.length;

    if (lessons.length === 0) {
      return;
    }

    const lessonIds = lessons.map((l) => l.id);

    // Batch load all existing lesson discounts
    const existingLessonDiscounts = await queryRunner.manager.find(LessonDiscount, {
      where: {
        lessonId: In(lessonIds),
        enrolmentId: enrolment.id,
        type: 5, // TYPE_GROUP = 5
      },
    });

    // Create a map for quick lookup
    const lessonDiscountMap = new Map<number, LessonDiscount>();
    existingLessonDiscounts.forEach((ld) => {
      lessonDiscountMap.set(ld.lessonId, ld);
    });

    // Batch load all group lessons
    const groupLessons = await queryRunner.manager.find(GroupLesson, {
      where: {
        lessonId: In(lessonIds),
        enrolmentId: enrolment.id,
        isDeleted: false,
      },
    });

    // Create a map for quick lookup
    const groupLessonMap = new Map<number, GroupLesson>();
    groupLessons.forEach((gl) => {
      groupLessonMap.set(gl.lessonId, gl);
    });

    // Batch load all credit amounts in one query
    const creditAmountsResult = await queryRunner.manager
      .createQueryBuilder('lesson_payment', 'lp')
      .select('lp.lessonId', 'lessonId')
      .addSelect('COALESCE(SUM(lp.amount), 0)', 'creditAmount')
      .where('lp.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
      .andWhere('lp.isDeleted = 0')
      .groupBy('lp.lessonId')
      .getRawMany();

    // Create a map for quick lookup
    const creditAmountMap = new Map<number, number>();
    creditAmountsResult.forEach((row) => {
      creditAmountMap.set(row.lessonId, Number(row.creditAmount || 0));
    });

    // Prepare lesson discounts and group lessons for batch save
    const lessonDiscountsToSave: LessonDiscount[] = [];
    const groupLessonsToSave: GroupLesson[] = [];

    // Calculate discount value per lesson
    const discountValuePerLesson =
      discountType === EnrolmentDiscount.VALUE_TYPE_PERCENTAGE
        ? discountValue
        : totalLessonCount > 0
          ? discountValue / totalLessonCount
          : 0;

    // Process each lesson
    for (const lesson of lessons) {
      // Find or create lesson discount
      let lessonDiscount = lessonDiscountMap.get(lesson.id);

      if (!lessonDiscount) {
        lessonDiscount = queryRunner.manager.create(LessonDiscount, {
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          type: 5, // TYPE_GROUP = 5
        });
      }

      // At this point, lessonDiscount is guaranteed to be defined
      // Use non-null assertion since we've checked/created it above
      const discount: LessonDiscount = lessonDiscount!;

      // Set discount value based on type
      if (discountType === EnrolmentDiscount.VALUE_TYPE_PERCENTAGE) {
        discount.valueType = 1; // VALUE_TYPE_PERCENTAGE
        discount.value = discountValue;
      } else {
        // VALUE_TYPE_DOLLAR
        discount.valueType = 0; // VALUE_TYPE_DOLLAR
        discount.value = discountValuePerLesson;
      }

      lessonDiscountsToSave.push(discount);

      // Recalculate group lesson total and balance
      const groupLesson = groupLessonMap.get(lesson.id);

      if (groupLesson) {
        // Calculate gross price: programRate + tax (lessons already loaded with these fields)
        const grossPrice = Number(lesson.programRate || 0) + Number(lesson.tax || 0);

        // Calculate discount amount
        let discountAmount = 0;
        if (discount.valueType === 0) {
          // Dollar discount
          discountAmount = Number(discount.value || 0);
        } else {
          // Percentage discount
          discountAmount = (grossPrice * Number(discount.value || 0)) / 100;
        }

        // Calculate total: grossPrice - discountAmount
        const total = RoundingUtils.roundDecimal(grossPrice - discountAmount, 2);

        // Get credit applied amount from map
        const creditAppliedAmount = creditAmountMap.get(lesson.id) || 0;

        // Calculate balance: total - creditAppliedAmount
        const balance = RoundingUtils.roundDecimal(total - creditAppliedAmount, 2);

        // Update group lesson
        groupLesson.total = total;
        groupLesson.balance = balance;

        // Update paidStatus based on balance
        if (balance === 0) {
          groupLesson.paidStatus = GroupLesson.STATUS_PAID;
        } else if (balance > 0) {
          groupLesson.paidStatus = GroupLesson.STATUS_OWING;
        } else if (balance < 0) {
          groupLesson.paidStatus = GroupLesson.STATUS_CREDIT;
        }

        groupLessonsToSave.push(groupLesson);
      }
    }

    // Batch save all lesson discounts
    if (lessonDiscountsToSave.length > 0) {
      await queryRunner.manager.save(LessonDiscount, lessonDiscountsToSave);
    }

    // Batch save all group lessons
    if (groupLessonsToSave.length > 0) {
      await queryRunner.manager.save(GroupLesson, groupLessonsToSave);
    }
  }

  /**
   * Reset discount - updates lesson discounts for private enrolments
   * Matches legacy: Enrolment::resetDiscount()
   */
  private async resetDiscount(
    queryRunner: any,
    enrolment: Enrolment,
    course: Course,
    discountType: number,
    discountValue: number,
    privateDiscountCycleRange?: PrivateDiscountCycleRange | null,
  ): Promise<void> {
    const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

    if (!isPrivateProgram || !privateDiscountCycleRange) {
      return; // Only applies to editable private enrolments
    }

    // Map enrolment discount type to lesson discount type
    // Match legacy: EnrolmentDiscount::TYPE_PAYMENT_FREQUENCY (1) -> LessonDiscount::TYPE_ENROLMENT_PAYMENT_FREQUENCY (2)
    // Match legacy: EnrolmentDiscount::TYPE_MULTIPLE_ENROLMENT (2) -> LessonDiscount::TYPE_MULTIPLE_ENROLMENT (3)
    let lessonDiscountType: number;
    if (discountType === EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY) {
      lessonDiscountType = 2; // LessonDiscount::TYPE_ENROLMENT_PAYMENT_FREQUENCY
    } else {
      lessonDiscountType = 3; // LessonDiscount::TYPE_MULTIPLE_ENROLMENT
    }

    // Get lessons: all upcoming scheduled/rescheduled lessons with balance > 0
    // Match legacy: Lesson::find()->notDeleted()->notCompleted()->isConfirmed()->notCanceled()
    // ->joinWith(['privateLesson' => function ($query) { $query->andWhere(['>', 'private_lesson.balance', 0]); }])
    const lessons = await queryRunner.manager
      .createQueryBuilder(Lesson, 'lesson')
      .leftJoin('private_lesson', 'pl', 'pl.lessonId = lesson.id')
      .where('lesson.courseId = :courseId', { courseId: course.id })
      .andWhere('lesson.isDeleted = 0')
      .andWhere('lesson.isConfirmed = 1')
      .andWhere('lesson.status IN (:...activeStatuses)', {
        activeStatuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED],
      })
      .andWhere('pl.balance > 0')
      .andWhere('lesson.date >= NOW()')
      .orderBy('lesson.date', 'ASC')
      .getMany();

    for (const lesson of lessons) {
      // Find existing lesson discount
      const existingLessonDiscount = await queryRunner.manager.findOne(LessonDiscount, {
        where: {
          type: lessonDiscountType,
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
        },
      });

      if (existingLessonDiscount) {
        // Update existing discount
        const oldValue = existingLessonDiscount.value;
        if (lessonDiscountType === 2) {
          // Payment Frequency Discount: use value as-is (percentage)
          existingLessonDiscount.value = discountValue;
        } else {
          // Multiple Enrolment Discount: divide by 4 (dollar)
          existingLessonDiscount.value = discountValue / 4;
        }
        await queryRunner.manager.save(existingLessonDiscount);
      } else {
        // Create new lesson discount
        const newLessonDiscount = queryRunner.manager.create(LessonDiscount, {
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          type: lessonDiscountType,
        });

        if (lessonDiscountType === 2) {
          // Payment Frequency Discount: percentage
          newLessonDiscount.value = discountValue;
          newLessonDiscount.valueType = 1; // LessonDiscount::VALUE_TYPE_PERCENTAGE
        } else {
          // Multiple Enrolment Discount: dollar
          newLessonDiscount.value = discountValue / 4;
          newLessonDiscount.valueType = 0; // LessonDiscount::VALUE_TYPE_DOLLAR
        }

        await queryRunner.manager.save(newLessonDiscount);
      }

      // Match legacy: after saving LessonDiscount, save privateLesson to recalculate total/balance
      // Legacy: $this->lesson->privateLesson->save() in LessonDiscount::afterSave()
      // This triggers PrivateLesson::beforeSave() which recalculates total and balance using lesson->netPrice
      // The lesson->netPrice getter loads the lesson with all discounts and calculates the price
      
      // IMPORTANT: Query discounts directly after saving to ensure we get the latest values
      // The relation might not be updated immediately after save
      const allDiscounts = await queryRunner.manager.find(LessonDiscount, {
        where: { lessonId: lesson.id },
      });

      // Reload lesson to get current programRate, duration, tax, and the freshly saved discounts.
      const updatedLesson = await queryRunner.manager.findOne(Lesson, {
        where: { id: lesson.id },
        relations: ['discounts'],
      });

      if (updatedLesson) {
        // Match legacy Lesson::getNetPrice() / PrivateLesson::beforeSave().
        // The lesson entity already applies discount type precedence correctly,
        // including PF discounts as percentage discounts on the remaining price.
        (updatedLesson as any).discounts = allDiscounts;
        const netPrice = Number(updatedLesson.getNetPrice());

        // Get credit applied amount for balance calculation
        // Match legacy: getCreditAppliedAmount() - sums LessonPayment amounts where payment
        // is not deleted and payment method is NOT TYPE_CREDIT_USED
        const creditResult = await queryRunner.manager
          .createQueryBuilder()
          .select('COALESCE(SUM(lp.amount), 0)', 'total')
          .from(LessonPayment, 'lp')
          .leftJoin('payment', 'p', 'p.id = lp.paymentId')
          .where('lp.lessonId = :lessonId', { lessonId: lesson.id })
          .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: enrolment.id })
          .andWhere('lp.isDeleted = 0')
          .andWhere('p.isDeleted = 0')
          .andWhere('p.paymentMethodId != :creditUsedMethodId', {
            creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
          })
          .getRawOne();

        const creditAmount = creditResult?.total ? parseFloat(creditResult.total) : 0;
        const balance = RoundingUtils.roundDecimal(netPrice - creditAmount, 2);

        // Update private_lesson
        await queryRunner.manager
          .createQueryBuilder()
          .update(PrivateLesson)
          .set({
            total: netPrice,
            balance: balance,
          })
          .where('lessonId = :lessonId', { lessonId: lesson.id })
          .execute();
      }
    }
  }

  /**
   * Log discount change - creates log entry for discount changes
   * Matches legacy: DiscountLog::enrolmentMultipleDiscountEdit() and enrolmentPaymentFrequencyDiscountEdit()
   */
  private async logDiscountChange(
    queryRunner: any,
    enrolment: Enrolment,
    loggedUser: User,
    discountTypeName: string,
    oldDiscount: string | number | null,
    newDiscount: number,
    locationId: number,
    locationSlug: string,
  ): Promise<void> {
    // Get log object and activity
    const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.ENROLMENT);
    const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_UPDATE);

    if (!logObject || !logActivity) {
      return;
    }

    // Get customer from student
    // Match legacy: $enrolmentModel->customer->publicIdentity
    // Use the direct user relation because customer_id maps to user.id in legacy.
    const student = await queryRunner.manager
      .createQueryBuilder(Student, 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('student.id = :studentId', { studentId: enrolment.studentId })
      .getOne();

    if (!student || !student.user) {
      return;
    }

    // Get customer user
    const customerUser = student.user;
    const customerIndex = customerUser.profile
      ? `${customerUser.profile.firstname || ''} ${customerUser.profile.lastname || ''}`.trim() || customerUser.username
      : customerUser.username;
    const customerId = customerUser.id;
    const customerPath = `/v2/admin/${locationSlug}/customers/${customerId}`;

    // Format message based on discount type
    // Match legacy format exactly from DiscountLog.php
    // oldDiscount comes from getValue() methods which return formatted strings:
    // - getPaymentFrequencyDiscountValue() returns "Not set" or "5%"
    // - getMultipleEnrolmentDiscountValue() returns "Not set" or "$5"
    // newDiscount is the raw numeric value from the discount model
    
    // For Multiple Enrolment: if empty($oldDiscount), set to 0 (but "Not set" is not empty, so stays "Not set")
    // For Payment Frequency: no such check, use value as-is
    let oldDiscountDisplay: string | number;
    if (discountTypeName === 'Multiple Enrolment Discount') {
      // Match legacy: if (empty($oldDiscount)) { $oldDiscount = 0; }
      // But "Not set" and "$5" are not empty, so they stay as-is
      // However, if oldDiscount is an empty string or null, set to 0
      if (oldDiscount === null || oldDiscount === undefined || oldDiscount === '') {
        oldDiscountDisplay = 0;
      } else if (typeof oldDiscount === 'string' && oldDiscount.trim() === '') {
        oldDiscountDisplay = 0;
      } else {
        // At this point, oldDiscount is guaranteed to be string | number (not null)
        oldDiscountDisplay = oldDiscount as string | number;
      }
    } else {
      // Payment Frequency: use value as-is (can be "Not set" or "5%")
      oldDiscountDisplay = oldDiscount ?? 'Not set';
    }
    
    // newDiscount: use the raw numeric value (legacy passes $multipleEnrolmentDiscount->discount directly)
    const newDiscountDisplay = (newDiscount === null || newDiscount === undefined || newDiscount === 0) ? '' : String(newDiscount);
    
    let message: string;
    const userDisplayName = `${loggedUser.profile?.firstname || ''} ${loggedUser.profile?.lastname || ''}`.trim() || loggedUser.username;
    
    if (discountTypeName === 'Payment Frequency Discount') {
      // Match legacy: "changed the Payment Frequency Discount from  {old}  to   {new}%    for {{index}}"
      // oldDiscount is "Not set" or "5%" (formatted string from getValue())
      // newDiscount is raw number, % is added in the message
      message = `${userDisplayName} changed the Payment Frequency Discount from  ${oldDiscountDisplay}  to   ${newDiscountDisplay}%    for {{${customerIndex}}}`;
    } else {
      // Match legacy: "changed the Multiple Enrolment Discount from  {old}  to    $ {new}  for {{index}}"
      // oldDiscount is "Not set" or "$5" (formatted string from getValue())
      // newDiscount is raw number, $ is added in the message
      message = `${userDisplayName} changed the Multiple Enrolment Discount from  ${oldDiscountDisplay}  to    $ ${newDiscountDisplay}  for {{${customerIndex}}}`;
    }

    // Create log entry
    const log = queryRunner.manager.create(Log, {
      logObjectId: logObject.id,
      logActivityId: logActivity.id,
      message: message.trim(),
      data: JSON.stringify({ id: enrolment.id }),
      createdUserId: loggedUser.id,
      locationId: locationId,
      createdOn: new Date(),
    });

    const savedLog = await queryRunner.manager.save(log);

    // Create log link
    const logLink = queryRunner.manager.create(LogLink, {
      logId: savedLog.id,
      index: customerIndex,
      baseUrl: process.env.BASE_URL || '',
      path: customerPath,
    });

    await queryRunner.manager.save(logLink);

    // Create log history
    const logHistory = queryRunner.manager.create(LogHistory, {
      logId: savedLog.id,
      instanceId: enrolment.id,
      instanceType: LogObjectType.ENROLMENT,
    });

    await queryRunner.manager.save(logHistory);
  }

  /**
   * Full delete enrolment - deletes enrolment with all transactional data
   * Matches legacy: EnrolmentController::actionFullDelete() (POST request)
   * Deletes: payment cycles, proforma invoices, payments, lessons, invoices, credit usage
   */
  async fullDeleteEnrolment(
    locationId: number,
    enrolmentId: number,
    locationSlug: string,
  ): Promise<{ status: boolean; url?: string; message?: string; error?: string }> {
    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get enrolment with all necessary relations
      const enrolment = await queryRunner.manager.findOne(Enrolment, {
        where: { id: enrolmentId, isDeleted: false },
        relations: ['course', 'course.program', 'student', 'student.user'],
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Verify enrolment belongs to this location
      const course = await queryRunner.manager.findOne(Course, {
        where: { id: enrolment.courseId, locationId },
        relations: ['program'],
      });

      if (!course) {
        throw new NotFoundException(`Course not found or does not belong to location`);
      }

      // Check if program is private (only private enrolments can be fully deleted)
      const isPrivateProgram = course.program?.type === Program.TYPE_PRIVATE_PROGRAM;

      if (!isPrivateProgram) {
        await queryRunner.rollbackTransaction();
        return {
          status: false,
          error: 'Full delete is only available for private enrolments.',
        };
      }

      const studentId = enrolment.studentId;
      const student = enrolment.student;

      // 1. Get all confirmed lessons for this course (ordered by date for startDate updates)
      const lessons = await queryRunner.manager.find(Lesson, {
        where: {
          courseId: enrolment.courseId,
          isConfirmed: true,
          isDeleted: false,
        },
        order: {
          date: 'ASC',
        },
      });

      // 2. Delete payment cycles and their related data (optimized with batch operations)
      // Match legacy: delete payment_cycle_lesson first, then payment cycles with proforma invoices
      const paymentCycles = await queryRunner.manager.find(PaymentCycle, {
        where: {
          enrolmentId: enrolmentId,
          isDeleted: 0,
        },
      });

      // First, delete all payment_cycle_lesson records for these payment cycles
      const paymentCycleIds = paymentCycles.map(pc => pc.id);
      if (paymentCycleIds.length > 0) {
        await queryRunner.manager.update(
          PaymentCycleLesson,
          { paymentCycleId: In(paymentCycleIds), isDeleted: 0 },
          { isDeleted: 1 },
        );

        // Batch fetch all proforma invoices for all payment cycles at once
        const proformaInvoices = await queryRunner.manager
          .createQueryBuilder(Invoice, 'invoice')
          .innerJoin('invoice_line_item', 'ili', 'ili.invoice_id = invoice.id AND ili.isDeleted = 0')
          .innerJoin('invoice_item_payment_cycle_lesson', 'iipcl', 'iipcl.invoiceLineItemId = ili.id')
          .innerJoin('payment_cycle_lesson', 'pcl', 'iipcl.paymentCycleLessonId = pcl.id')
          .where('pcl.paymentCycleId IN (:...paymentCycleIds)', { paymentCycleIds })
          .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_PRO_FORMA_INVOICE })
          .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: 0 })
          .getMany();

        // Batch fetch all payments for all proforma invoices at once
        const proformaInvoiceIds = proformaInvoices.map(inv => inv.id);
        if (proformaInvoiceIds.length > 0) {
          const proformaPayments = await queryRunner.manager
            .createQueryBuilder(Payment, 'payment')
            .innerJoin('invoice_payment', 'ip', 'ip.payment_id = payment.id')
            .where('ip.invoice_id IN (:...invoiceIds)', { invoiceIds: proformaInvoiceIds })
            .andWhere('ip.isDeleted = :ipIsDeleted', { ipIsDeleted: 0 })
            .andWhere('payment.isDeleted = :paymentIsDeleted', { paymentIsDeleted: 0 })
            .getMany();

          // Batch update all proforma payments
          if (proformaPayments.length > 0) {
            const proformaPaymentIds = proformaPayments.map(p => p.id);
            await queryRunner.manager.update(
              Payment,
              { id: In(proformaPaymentIds) },
              { isDeleted: 1 },
            );
          }

          // Batch update all proforma invoices (set tax and isTaxAdjusted to 0, then delete)
          await queryRunner.manager.update(
            Invoice,
            { id: In(proformaInvoiceIds) },
            { tax: 0, isTaxAdjusted: 0, isDeleted: true },
          );
        }

        // Batch update all payment cycles
        await queryRunner.manager.update(
          PaymentCycle,
          { id: In(paymentCycleIds) },
          { isDeleted: 1 },
        );
      }

      // 3. Delete lessons and their invoices/payments (optimized with batch operations)
      // Match legacy: for each lesson, delete invoice (if exists), update course startDate, update customer balance
      const customerAccount = student?.user?.id
        ? await queryRunner.manager.findOne(CustomerAccount, {
            where: { customerId: student.user.id },
          })
        : null;

      const lessonIds = lessons.map(l => l.id);

      // Batch fetch all invoices for all lessons at once.
      //
      // Guarded because an enrolment can legitimately have no lessons - one
      // saved but never confirmed, or one whose lessons were already removed -
      // and `IN (:...lessonIds)` with an empty array renders `IN ()`, which is
      // a MySQL syntax error rather than an empty result. The whole delete then
      // failed with "Failed to fully delete enrolment" and the enrolment could
      // not be removed through the app at all.
      //
      // Every other batch in this method already guards its own array; this one
      // and the `nextLesson` lookup below were the two that did not.
      const lessonInvoices = lessonIds.length > 0
        ? await queryRunner.manager
            .createQueryBuilder(Invoice, 'invoice')
            .innerJoin('invoice_line_item', 'ili', 'ili.invoice_id = invoice.id AND ili.isDeleted = 0')
            .innerJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = ili.id')
            .where('iil.lessonId IN (:...lessonIds)', { lessonIds })
            .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
            .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: 0 })
            .getMany()
        : [];

      // Batch fetch all payments for all invoices at once
      const invoiceIds = lessonInvoices.map(inv => inv.id);
      let invoicePayments: Payment[] = [];
      if (invoiceIds.length > 0) {
        invoicePayments = await queryRunner.manager
          .createQueryBuilder(Payment, 'payment')
          .innerJoin('invoice_payment', 'ip', 'ip.payment_id = payment.id')
          .where('ip.invoice_id IN (:...invoiceIds)', { invoiceIds })
          .andWhere('ip.isDeleted = :ipIsDeleted', { ipIsDeleted: 0 })
          .andWhere('payment.isDeleted = :paymentIsDeleted', { paymentIsDeleted: 0 })
          .getMany();
      }

      // Batch update all invoice payments
      if (invoicePayments.length > 0) {
        const paymentIds = invoicePayments.map(p => p.id);
        await queryRunner.manager.update(
          Payment,
          { id: In(paymentIds) },
          { isDeleted: 1 },
        );
      }

      // Batch update all invoices (set tax and isTaxAdjusted to 0, then delete)
      if (invoiceIds.length > 0) {
        await queryRunner.manager.update(
          Invoice,
          { id: In(invoiceIds) },
          { tax: 0, isTaxAdjusted: 0, isDeleted: true },
        );
      }

      // Batch fetch all private lessons for credit calculation
      const privateLessons = lessonIds.length > 0
        ? await queryRunner.manager.find(PrivateLesson, {
            where: { lessonId: In(lessonIds) },
          })
        : [];

      // Create a map for quick lookup
      const privateLessonMap = new Map(
        privateLessons.map(pl => [pl.lessonId, pl]),
      );

      // Calculate total credit amount to return (sum of all lesson credits)
      let totalCreditAmount = 0;
      for (const lesson of lessons) {
        const privateLesson = privateLessonMap.get(lesson.id);
        if (privateLesson) {
          const grossPrice = Number(lesson.programRate || 0) + Number(lesson.tax || 0);
          const discount = 0; // TODO: Calculate from lesson discounts if needed
          const netPrice = grossPrice - discount;
          const creditAmount = RoundingUtils.roundDecimal(netPrice, 2);
          totalCreditAmount += creditAmount;
        }
      }

      // Batch update all lessons
      if (lessonIds.length > 0) {
        await queryRunner.manager.update(
          Lesson,
          { id: In(lessonIds) },
          { isDeleted: true },
        );
      }

      // Update course startDate to next lesson's date (only once, after all deletions)
      // Since all lessons are being deleted, we don't need to update startDate
      // But if there are other lessons in the course, we should find the next one
      // `Not(In([]))` renders `NOT IN ()` and fails the same way. With no
      // lessons being deleted there is nothing to exclude, so the clause is
      // dropped rather than built from an empty set - which is also what it
      // means: any confirmed lesson still on the course.
      const nextLesson = await queryRunner.manager.findOne(Lesson, {
        where: {
          courseId: course.id,
          isConfirmed: true,
          isDeleted: false,
          ...(lessonIds.length > 0 ? { id: Not(In(lessonIds)) } : {}),
        },
        order: {
          date: 'ASC',
        },
      });

      if (nextLesson) {
        await queryRunner.manager.update(
          Course,
          { id: course.id },
          { startDate: nextLesson.date },
        );
      }

      // Update customer account balance once (revert credits - increase balance)
      // Match legacy: balance increases when lessons are deleted (credits are returned)
      if (customerAccount && totalCreditAmount > 0) {
        customerAccount.balance = Number(customerAccount.balance || 0) + totalCreditAmount;
        await queryRunner.manager.save(customerAccount);
      }

      // 4. Delete enrolment (soft delete)
      enrolment.isDeleted = true;
      await queryRunner.manager.save(enrolment);

      // Commit transaction
      await queryRunner.commitTransaction();

      // 5. Update student and customer status (outside transaction as it may be heavy)
      if (student) {
        await this.setStatus(studentId);
      }

      // Build redirect URL to student view (matches legacy behavior)
      const url = studentId ? `/${locationSlug}/students/${studentId}` : `/${locationSlug}/enrolments`;

      return {
        status: true,
        url,
        message: 'Enrolment has been fully deleted.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

}
