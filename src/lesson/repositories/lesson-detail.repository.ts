import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from 'src/program/enums/program-type';
import { StudentInfo } from '../dto/lesson-details-response.dto';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Classroom } from '../../classroom/entities/classroom.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { UpdateLessonDetailsRequestDto } from '../dto/update-lesson-details-request.dto';
import { GroupLessonStudentTabItemDto } from '../dto/group-lesson-students-tab-response.dto';
import { formatDate } from 'src/utils/date-utils';
import { formatCurrency } from 'src/utils/formatters';
import { getLessonClassName } from 'src/utils/helper';

@Injectable()
export class LessonDetailRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(CalendarEventColor)
    private readonly calendarEventColorRepository: Repository<CalendarEventColor>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
  ) {}

  /**
   * Get lesson details by ID with all required relations
   */
  async findLessonDetailsById(locationId: number, id: number): Promise<Lesson | null> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect(
        'course.enrolments',
        'enrolments',
        'enrolments.isDeleted = 0 AND enrolments.isConfirmed = 1',
      )
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.lessonHierarchy', 'hierarchy')
      .leftJoinAndSelect('hierarchy.lesson', 'rootLesson')
      .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
      .where('lesson.id = :id', { id })
      .andWhere('lesson.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  async isLessonAssignedToTeacher(
    locationId: number,
    lessonId: number,
    teacherId: number,
  ): Promise<boolean> {
    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .getCount();

    return count > 0;
  }

  async isLessonAssignedToCustomer(
    locationId: number,
    lessonId: number,
    customerId: number,
  ): Promise<boolean> {
    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin(
        'course.enrolments',
        'enrolment',
        'enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
      )
      .innerJoin('enrolment.student', 'student', 'student.isDeleted = 0')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :customerId', { customerId })
      .getCount();

    return count > 0;
  }

  /**
   * Get student and customer info for a lesson
   */
  async getStudentInfo(lessonId: number): Promise<StudentInfo | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment', 'enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1')
      .innerJoin('enrolment.student', 'student', 'student.isDeleted = 0')
      .innerJoin('student.user', 'customer')
      .leftJoin('customer.profile', 'customerProfile')
      // Join all contacts and phones
      .leftJoin('user_contact', 'userContact', 'userContact.userId = customer.id AND userContact.isDeleted = 0')
      .leftJoin('user_phone', 'userPhone', 'userPhone.userContactId = userContact.id AND userPhone.isDeleted = 0')
      .select([
        'student.id AS studentId',
        'CONCAT(student.first_name, " ", student.last_name) AS studentName',
        'customer.id AS customerId',
        'COALESCE(CONCAT(customerProfile.firstname, " ", customerProfile.lastname), customer.username) AS customerName',
        'userPhone.number AS phoneNumber',
      ])
      .where('lesson.id = :lessonId', { lessonId })
      .orderBy('userPhone.id IS NULL', 'ASC')
      .addOrderBy('userPhone.id', 'ASC')
      .getRawOne();

    return result || null;
  }

  async getStudentNoteByLessonId(lessonId: number): Promise<string | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin(
        'course.enrolments',
        'enrolment',
        'enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
      )
      .innerJoin('enrolment.student', 'student', 'student.isDeleted = 0')
      .select('student.note', 'note')
      .where('lesson.id = :lessonId', { lessonId })
      .orderBy('student.id', 'ASC')
      .getRawOne<{ note: string | null }>();

    return result?.note?.trim() ? result.note : '';
  }

  /**
   * Get color code with fallback logic
   * If colorCode is null, fetch default from calendar_event_color table
   */
  async getColorCode(lesson: Lesson): Promise<string | null> {
    // If colorCode is set directly, use it
    if (lesson.colorCode) {
      return lesson.colorCode;
    }

    // Otherwise, get default color based on lesson class
    const cssClass = await this.getLessonClass(lesson);
    
    if (cssClass) {
      const defaultColor = await this.calendarEventColorRepository.findOne({
        where: { cssClass },
      });
      return defaultColor?.code || null;
    }

    return null;
  }

  /**
   * Get CSS class for lesson
   */
  async getLessonClass(lesson: Lesson): Promise<string | null> {
    // Keep details behavior parity: absent/rescheduled statuses take precedence.
    if (!lesson.isPresent) {
      return 'absent-lesson';
    }

    if (lesson.status === LessonStatusEnum.RESCHEDULED) {
      return 'lesson-rescheduled';
    }

    const firstLessonIdByCourseId = await this.getFirstLessonIdByCourseId(
      lesson.courseId,
    );

    const className = getLessonClassName(lesson, {
      programType: lesson.course?.program?.type,
      firstLessonIdByCourseId,
      extraLessonType: 2,
    });

    return className || null;
  }

  private async getFirstLessonIdByCourseId(
    courseId?: number,
  ): Promise<Map<number, number>> {
    const firstLessonIdByCourseId = new Map<number, number>();

    if (!courseId) {
      return firstLessonIdByCourseId;
    }

    const firstLesson = await this.lessonRepository.findOne({
      where: {
        courseId,
        isDeleted: false,
        status: Not(LessonStatusEnum.CANCELED),
      },
      order: { date: 'ASC' },
      select: ['id'],
    });

    if (firstLesson?.id) {
      firstLessonIdByCourseId.set(courseId, firstLesson.id);
    }

    return firstLessonIdByCourseId;
  }

  async getLessonDiscounts(lessonId: number): Promise<LessonDiscount[]> {
    return await this.lessonDiscountRepository.find({
      where: { 
        lessonId,
      },
      order: {
        type: 'ASC', // Order by type for cascade processing
      },
    });
  }

  async getLessonPayments(lessonId: number, enrolmentId?: number): Promise<number> {
    const query = this.lessonPaymentRepository
      .createQueryBuilder('lessonPayment')
      .innerJoin(
        'lessonPayment.payment',
        'payment',
        'payment.isDeleted = :paymentNotDeleted AND payment.paymentMethodId != :creditUsedMethodId',
        {
          paymentNotDeleted: 0,
          creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
        },
      )
      .select('COALESCE(SUM(lessonPayment.amount), 0)', 'totalPaid')
      .where('lessonPayment.lessonId = :lessonId', { lessonId })
      .andWhere('lessonPayment.isDeleted = :isDeleted', { isDeleted: 0 });

    if (enrolmentId) {
      query.andWhere('lessonPayment.enrolmentId = :enrolmentId', { enrolmentId });
    }

    const result = await query.getRawOne();

    return parseFloat(result?.totalPaid || '0');
  }

  async getPrimaryEnrolmentId(lessonId: number): Promise<number | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin(
        'course.enrolments',
        'enrolment',
        'enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
      )
      .select('enrolment.id', 'enrolmentId')
      .where('lesson.id = :lessonId', { lessonId })
      .orderBy('enrolment.id', 'ASC')
      .limit(1)
      .getRawOne();

    return result?.enrolmentId ? Number(result.enrolmentId) : null;
  }

  async getLessonInvoice(
    lessonId: number,
  ): Promise<{ invoiceId: number; invoiceNumber: number; balance: number } | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
      .innerJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
      .select('inv.id', 'invoiceId')
      .addSelect('inv.invoiceNumber', 'invoiceNumber')
      .addSelect('inv.balance', 'balance')
      .where('lesson.id = :lessonId', { lessonId })
      .orderBy('inv.id', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.invoiceId) {
      return null;
    }

    return {
      invoiceId: Number(result.invoiceId),
      invoiceNumber: Number(result.invoiceNumber),
      balance: Number(result.balance || 0),
    };
  }

  /** 
   * Update lesson details (classroom, colorCode, isOnline)
   */
  async updateLessonDetails(
    lessonId: number,
    locationId: number,
    updateData: UpdateLessonDetailsRequestDto,
    userId: number,
  ): Promise<Lesson> {
    // Find lesson with relations
    const lesson = await this.findLessonDetailsById(locationId, lessonId);

    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }

    // Check business rules - match PHP behavior
    if (lesson.isDeleted) {
      throw new BadRequestException('Cannot edit deleted lessons');
    }

    // Legacy blocks deleted lessons only for this edit path.

    const updatePayload: Partial<Lesson> = {
      updatedByUserId: userId,
    };

    // Validate and update classroom if provided
    if (updateData.classroomId !== undefined) {
      if (updateData.classroomId !== null) {
        // Validate classroom exists and belongs to location
        const classroom = await this.classroomRepository.findOne({
          where: {
            id: updateData.classroomId,
            locationId: locationId,
            isDeleted: false,
          },
        });

        if (!classroom) {
          throw new BadRequestException(
            'Invalid classroom or classroom does not belong to this location'
          );
        }
      }

      await this.validateClassroomChange(lesson, locationId, updateData.classroomId);
      updatePayload.classroomId = updateData.classroomId as any;
    }

    // Update color code if provided
    if (updateData.colorCode !== undefined) {
      updatePayload.colorCode = (await this.normalizeColorCode(
        lesson,
        updateData.colorCode as any,
      )) as any;
    }

    // Update isOnline if provided (supports legacy `is_online` key)
    const isOnlineValue =
      updateData.isOnline !== undefined
        ? updateData.isOnline
        : (updateData as any).is_online;
    if (isOnlineValue !== undefined) {
      updatePayload.isOnline = Boolean(isOnlineValue);
    }

    // Use direct UPDATE to avoid relation objects overriding foreign-key fields.
    await this.lessonRepository.update(lesson.id, updatePayload);
    
    // Reload to get the actual saved values
    const reloadedLesson = await this.findLessonDetailsById(locationId, lessonId);
    
    if (!reloadedLesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found after save`);
    }

    (reloadedLesson as any).colorCode = await this.getColorCode(reloadedLesson);
    
    return reloadedLesson;
  }

  private async validateClassroomChange(
    lesson: Lesson,
    locationId: number,
    classroomId: number | null,
  ): Promise<void> {
    const lessonDate = lesson.date instanceof Date ? lesson.date : new Date(lesson.date);
    const lessonDateStr = lessonDate.toISOString().split('T')[0];
    const startTime = lessonDate.toTimeString().split(' ')[0];

    // Mirror the legacy validator: use hours/minutes and subtract 1 second.
    const [hours = 0, minutes = 0] = String(lesson.duration || '00:00:00')
      .split(':')
      .map((part) => Number(part) || 0);
    const end = new Date(lessonDate.getTime() + hours * 3600000 + minutes * 60000 - 1000);
    const endTime = end.toTimeString().split(' ')[0];

    const overlapQuery = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .where('lesson.id != :excludeLessonId', { excludeLessonId: lesson.id })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :lessonDate', { lessonDate: lessonDateStr })
      .andWhere(
        '(TIME(lesson.date) <= :endTime AND DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) > :startTime)',
        { startTime, endTime },
      );

    if (classroomId == null) {
      overlapQuery.andWhere('lesson.classroomId IS NULL');
    } else {
      overlapQuery.andWhere('lesson.classroomId = :classroomId', { classroomId });
    }

    const hasOverlap = await overlapQuery.getCount();

    if (hasOverlap > 0) {
      throw new BadRequestException('Classroom already chosen!');
    }

    const unavailabilityQuery = this.lessonRepository.manager
      .createQueryBuilder()
      .select('1')
      .from('classroom_unavailability', 'cu')
      .andWhere('DATE(cu.fromDate) <= :lessonDate', { lessonDate: lessonDateStr })
      .andWhere('DATE(cu.toDate) >= :lessonDate', { lessonDate: lessonDateStr });

    if (classroomId == null) {
      unavailabilityQuery.andWhere('cu.classroomId IS NULL');
    } else {
      unavailabilityQuery.andWhere('cu.classroomId = :classroomId', { classroomId });
    }

    const isUnavailable = await unavailabilityQuery.getCount();

    if (isUnavailable > 0) {
      throw new BadRequestException('Classroom is unavailable');
    }
  }

  // updte lesson due date
  async updateDueDate(lessonId: number, dueDate: string): Promise<void> {
    await this.lessonRepository.update(lessonId, { dueDate: dueDate as any });
  }

  private async normalizeColorCode(
    lesson: Lesson,
    colorCode: string | null,
  ): Promise<string | null> {
    if (colorCode == null) {
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

    const defaultColor = await this.calendarEventColorRepository.findOne({
      where: { cssClass },
    });

    if (defaultColor?.code?.toLowerCase() === colorCode.toLowerCase()) {
      return null;
    }

    return colorCode;
  }
  
  /**
   * Update lesson teacherRate
   */
  async updateTeacherRate(lessonId: number, teacherRate: number, updatedByUserId: number): Promise<void> {
    await this.lessonRepository.update(lessonId, {
      teacherRate,
      updatedByUserId,
      updatedOn: new Date(),
    });
  }

  /**
   * Update private_lesson total and balance
   */
  async updatePrivateLessonTotals(
    privateLessonId: number,
    total: number,
    balance: number,
  ): Promise<void> {
    await this.privateLessonRepository.update(privateLessonId, { total, balance });
  }

  /**
   * Get customer (user) ID from a lesson via enrolment → student → user
   * Used for updating customer balance after cost edit
   */
  async getCustomerIdByLesson(lessonId: number): Promise<number | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment', 'enrolment.isDeleted = 0')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('student.user', 'user')
      .select('user.id', 'customerId')
      .where('lesson.id = :lessonId', { lessonId })
      .getRawOne();

    return result?.customerId || null;
  }

  async getGroupLessonStudentTabRows(
    locationId: number,
    lessonId: number,
  ): Promise<GroupLessonStudentTabItemDto[]> {
    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('group_lesson', 'gl', 'gl.lessonId = lesson.id AND gl.isDeleted = 0')
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.id = gl.enrolmentId AND enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
      )
      .innerJoin('student', 'student', 'student.id = enrolment.studentId AND student.isDeleted = 0')
      .innerJoin('user', 'customer', 'customer.id = student.customer_id AND customer.isDeleted = 0')
      .innerJoin(
        'user_location',
        'ul',
        'ul.user_id = customer.id AND ul.location_id = :locationId',
        { locationId },
      )
      .leftJoin('user_profile', 'up', 'up.user_id = customer.id')
      .leftJoin(
        'lesson_discount',
        'ld',
        'ld.lessonId = lesson.id AND ld.enrolmentId = enrolment.id AND ld.type = :groupDiscountType',
        { groupDiscountType: LessonDiscount.TYPE_GROUP },
      )
      .leftJoin(
        'lesson_payment',
        'lp',
        'lp.lessonId = lesson.id AND lp.enrolmentId = enrolment.id AND lp.isDeleted = 0',
      )
      .leftJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .leftJoin(
        'invoice_item_enrolment',
        'iie',
        'iie.enrolmentId = enrolment.id AND iie.invoiceLineItemId = iil.invoiceLineItemId',
      )
      .leftJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
      .leftJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = 0')
      .andWhere('lesson.isConfirmed = 1')
      .andWhere('course.locationId = :locationId', { locationId })
      .select('gl.id', 'groupLessonId')
      .addSelect('lesson.id', 'lessonId')
      .addSelect('enrolment.id', 'enrolmentId')
      .addSelect('student.id', 'studentId')
      .addSelect("CONCAT(COALESCE(student.first_name, ''), ' ', COALESCE(student.last_name, ''))", 'studentName')
      .addSelect(
        "TRIM(COALESCE(NULLIF(CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')), ''), customer.username))",
        'customerName',
      )
      .addSelect('gl.dueDate', 'dueDate')
      .addSelect('lesson.programRate', 'grossPrice')
      .addSelect(
        `CASE
           WHEN ld.id IS NULL THEN 0
           WHEN ld.valueType = 1 THEN (COALESCE(ld.value, 0) / 100.0) * lesson.programRate
           ELSE COALESCE(ld.value, 0)
         END`,
        'discount',
      )
      .addSelect('gl.total', 'netPrice')
      .addSelect('gl.balance', 'owing')
      .addSelect(
        `MAX(CASE
          WHEN iie.id IS NOT NULL AND ili.id IS NOT NULL AND inv.id IS NOT NULL
          THEN inv.id
          ELSE NULL
        END)`,
        'invoiceId',
      )
      .addSelect(
        `CASE
          WHEN MAX(CASE
            WHEN iie.id IS NOT NULL AND ili.id IS NOT NULL AND inv.id IS NOT NULL
            THEN 1
            ELSE 0
          END) = 1
          THEN 1
          ELSE 0
        END`,
        'hasInvoice',
      )
      .addSelect('CASE WHEN COUNT(lp.id) > 0 THEN 1 ELSE 0 END', 'hasPayment')
      .groupBy('gl.id')
      .addGroupBy('lesson.id')
      .addGroupBy('enrolment.id')
      .addGroupBy('student.id')
      .addGroupBy('up.user_id')
      .addGroupBy('customer.username')
      .addGroupBy('gl.dueDate')
      .addGroupBy('lesson.programRate')
      .addGroupBy('ld.id')
      .addGroupBy('ld.valueType')
      .addGroupBy('ld.value')
      .addGroupBy('gl.total')
      .addGroupBy('gl.balance')
      .orderBy('student.first_name', 'ASC')
      .addOrderBy('student.last_name', 'ASC')
      .getRawMany();

    return rows.map((row) => ({
      groupLessonId: Number(row.groupLessonId),
      lessonId: Number(row.lessonId),
      enrolmentId: Number(row.enrolmentId),
      studentId: Number(row.studentId),
      studentName: (row.studentName ?? '').trim(),
      customerName: (row.customerName ?? '').trim(),
      dueDate: row.dueDate ? formatDate(row.dueDate) : null,
      grossPrice: formatCurrency(Number(row.grossPrice) || 0),
      discount: formatCurrency(Number(row.discount) || 0),
      netPrice: formatCurrency(Number(row.netPrice) || 0),
      owing: formatCurrency(Number(row.owing) || 0),
      hasInvoice: Number(row.hasInvoice) === 1,
      invoiceId: row.invoiceId ? Number(row.invoiceId) : null,
      hasPayment: Number(row.hasPayment) === 1,
    }));
  }
}
