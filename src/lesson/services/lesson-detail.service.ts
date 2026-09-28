import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LessonDetailRepository } from '../repositories/lesson-detail.repository';
import { LessonScheduleRepository } from '../repositories/lesson-schedule.repository';
import { LessonDetailsResponse } from '../dto/lesson-details-response.dto';
import { ProgramTypeEnum } from 'src/program/enums/program-type';
import { getStatus } from '../enums/lesson-status';
import { LessonScheduleTransformationService } from './transformation/lesson-schedule-transformation.service';
import { LessonConfirmationService } from './lesson-confirmation.service';
import { formatCurrency } from '../../utils/formatters';
import { parseDateFromIso } from '../../utils/date-utils';
import { UpdateLessonDetailsRequestDto } from '../dto/update-lesson-details-request.dto';
import { Lesson } from '../entities/lesson.entity';
import { GroupLessonStudentsTabDataDto } from '../dto/group-lesson-students-tab-response.dto';
import { LessonPaymentService } from './lesson-payment.service';
import { LessonPaymentResponseDto } from '../dto/lesson-payment-response.dto';
import { RoundingUtils } from '../../utils/rounding.utils';
import { publicProgramName } from '../../pricing/utils/program-public-name';

@Injectable()
export class LessonDetailService {
  constructor(
    private readonly lessonDetailRepository: LessonDetailRepository,
    private readonly lessonScheduleRepository: LessonScheduleRepository,
    private readonly lessonScheduleTransformationService: LessonScheduleTransformationService,
    private readonly lessonConfirmationService: LessonConfirmationService,
    private readonly lessonPaymentService: LessonPaymentService,
  ) {}

  async getLessonDetails(locationId: number, locationSlug: string, id: number): Promise<LessonDetailsResponse> {
    try {
      const lesson = await this.lessonDetailRepository.findLessonDetailsById(locationId, id);

      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${id} not found in location ${locationSlug}`);
      }

      const isGroupLesson = lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM;

      const [schedule, discounts] = await Promise.all([
        this.lessonScheduleRepository.getSchedule(id),
        this.lessonDetailRepository.getLessonDiscounts(id),
      ]);

      const [student, dueDate, invoiceSummary] = isGroupLesson
        ? [null, null, null]
        : await Promise.all([
            this.lessonDetailRepository.getStudentInfo(id),
            this.lessonScheduleRepository.getDueDate(id),
            this.lessonDetailRepository.getLessonInvoice(id),
          ]);
      const totalPaid = await this.lessonDetailRepository.getLessonPayments(id);


      // Get color code with fallback logic
      const colorCode = await this.lessonDetailRepository.getColorCode(lesson);

     
      const LessonInfo = {
        id: lesson.id,
        programId: lesson.course?.program?.id || 0,
        // Reaches the customer and student lesson schedule.
        programName:
          publicProgramName(lesson.course?.program, lesson.course?.locationId) ||
          'Unknown',
        classroomName: lesson.classroom?.name || 'None',
        status: getStatus(lesson) || 'Unknown',
        colorCode: colorCode,
        isOnline: lesson.isOnline ? 'Yes' : 'No',
        isPrivate: lesson.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM,
        isGroup: lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM,
      };

      const studentInfo = isGroupLesson
        ? null
        : {
            studentId: student?.studentId || 0,
            customerId: student?.customerId || 0,
            studentName: student?.studentName || 'Unknown',
            customerName: student?.customerName || 'Unknown',
            phoneNumber: student?.phoneNumber?.trim()
              ? student.phoneNumber
              : 'None',
          };

      const scheduleInfo = schedule || {
        teacher: 'Unknown',
        teacherId: 0,
        originalDate: null,
        scheduledDate: null,
        time: null,
        duration: null,
        expiryDate: null,
      };

      const transformedData = this.lessonScheduleTransformationService.transformToAttendanceCostTotals(
        lesson,
        discounts,
        totalPaid,
        invoiceSummary,
      );

      return {
        body: {
          lesson: LessonInfo,
          student: studentInfo,
          schedule: scheduleInfo,
          dueDate: isGroupLesson ? null : (dueDate ? { dueDate } : null),
          attendance: isGroupLesson ? null : transformedData.attendance, // private-only in legacy view
          cost: transformedData.cost,
          totals: isGroupLesson ? null : transformedData.totals,
        },
      } as LessonDetailsResponse;

    } catch (error) {
      console.error('Error in getLessonDetails service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to retrieve lesson details: ${error.message}`);
    }
  }

  async getGroupLessonStudentsTab(
    locationId: number,
    locationSlug: string,
    lessonId: number,
  ): Promise<GroupLessonStudentsTabDataDto> {
    try {
      const lesson = await this.lessonDetailRepository.findLessonDetailsById(locationId, lessonId);

      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found in location ${locationSlug}`);
      }

      if (lesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
        throw new BadRequestException('Only applicable for group lessons');
      }

      const rows = await this.lessonDetailRepository.getGroupLessonStudentTabRows(locationId, lessonId);
      return { body: rows };
    } catch (error) {
      console.error('Error in getGroupLessonStudentsTab service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to retrieve group lesson students: ${error.message}`);
    }
  }

  async getGroupLessonPayments(
    locationId: number,
    locationSlug: string,
    lessonId: number,
    enrolmentId: number,
    sortField?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<LessonPaymentResponseDto> {
    try {
      const lesson = await this.lessonDetailRepository.findLessonDetailsById(locationId, lessonId);

      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found in location ${locationSlug}`);
      }

      if (lesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
        throw new BadRequestException('Only applicable for group lessons');
      }

      return await this.lessonPaymentService.getLessonPayments(
        lessonId,
        sortField,
        sortOrder,
        enrolmentId,
      );
    } catch (error) {
      console.error('Error in getGroupLessonPayments service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to retrieve group lesson payments: ${error.message}`);
    }
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
    try {
      const updatedLesson = await this.lessonDetailRepository.updateLessonDetails(
        lessonId,
        locationId,
        updateData,
        userId,
      );

      return updatedLesson;
    } catch (error) {
      console.error('Error in updateLessonDetails service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to update lesson details: ${error.message}`);
    }
  }

  /**
   * Update lesson due date (date-only field)
   */
  async updateLessonDueDate(
    lessonId: number,
    locationId: number,
    dueDateStr: string,
  ): Promise<{ dueDate: string }> {
    const lesson = await this.lessonDetailRepository.findLessonDetailsById(locationId, lessonId);

    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }

    // Legacy accepts both "YYYY-MM-DD" and "MMM D, YYYY"
    const parsedDueDate = parseDateFromIso(dueDateStr);
    if (Number.isNaN(parsedDueDate.getTime())) {
      throw new BadRequestException('Invalid dueDate format');
    }
    const normalizedDueDate = parsedDueDate.toISOString().split('T')[0];

    // Persist as date-only string to avoid timezone drift on DATE column.
    await this.lessonDetailRepository.updateDueDate(lesson.id, normalizedDueDate);

    return { dueDate: normalizedDueDate };
  }
  /**
   * Update lesson cost (teacherRate)
   * Mirrors legacy
   *
   * Legacy flow on $model->save():
   *   1. Lesson::beforeSave()  → sets teacherRate default if falsy
   *   2. DB UPDATE              → lesson.teacherRate saved
   *   3. Lesson::afterSave()   → calls privateLesson->save()
   *   4. PrivateLesson::beforeSave() → recalculates total & balance
   *   5. Lesson::afterSave()   → calls customer->updateCustomerBalance()
   *
   * Note: teacherRate does NOT affect netPrice (which uses programRate).
   * Non-exploded lessons retain the legacy recalculation behavior. Exploded
   * children must preserve their stored cent-safe total because recalculating
   * from independently split discount rows can remove the parent's remainder.
   */
  async updateLessonCost(
    lessonId: number,
    locationId: number,
    teacherRate: number,
    userId: number,
  ): Promise<{ costPerHour: string; cost: string; price: string; profit: string }> {
    // 1. Load lesson with relations (privateLesson, course, program)
    const lesson = await this.lessonDetailRepository.findLessonDetailsById(locationId, lessonId);

    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }

    // 2. Update teacherRate (legacy: $model->teacherRate = POST value)
    await this.lessonDetailRepository.updateTeacherRate(lesson.id, teacherRate, userId);

    // 3. Recalculate PrivateLesson totals (legacy: PrivateLesson::beforeSave)
    const discounts = await this.lessonDetailRepository.getLessonDiscounts(lesson.id);
    lesson.discounts = discounts;

    // Keep the legacy lesson entity as the single source of truth for money.
    const unit =
      typeof lesson.getUnit === 'function'
        ? lesson.getUnit()
        : this.lessonScheduleTransformationService.calculateUnit(lesson.duration);
    const grossPrice =
      typeof lesson.getGrossPrice === 'function'
        ? lesson.getGrossPrice()
        : this.lessonScheduleTransformationService.calculateGrossPrice(
            Number(lesson.programRate ?? 0),
            unit,
            lesson,
          );
    const discount =
      typeof lesson.getDiscount === 'function'
        ? lesson.getDiscount()
        : this.lessonScheduleTransformationService.calculateDiscount(
            grossPrice,
            discounts,
          );
    const subTotal =
      typeof lesson.getSubTotal === 'function'
        ? lesson.getSubTotal()
        : this.lessonScheduleTransformationService.calculateSubTotal(
            grossPrice,
            discount,
          );
    const netPrice =
      typeof lesson.getNetPrice === 'function'
        ? lesson.getNetPrice()
        : RoundingUtils.roundHalfUpForLesson(
            subTotal + Number(lesson.tax ?? 0),
            2,
          );

    const privateLesson = lesson.privateLesson?.[0];
    const storedPrivateTotal =
      privateLesson?.total === null || privateLesson?.total === undefined
        ? Number.NaN
        : Number(privateLesson.total);
    const preserveExplodedTotal =
      Number(lesson.isExploded ?? 0) === 1 &&
      Number.isFinite(storedPrivateTotal);
    const displayedSubTotal = preserveExplodedTotal
      ? RoundingUtils.roundDecimal(
          storedPrivateTotal - Number(lesson.tax ?? 0),
          2,
        )
      : subTotal;

    if (privateLesson && !preserveExplodedTotal) {
      const totalPaid = await this.lessonDetailRepository.getLessonPayments(lesson.id);
      const total = netPrice || 0;
      const balance =
        RoundingUtils.roundHalfUpForLesson(netPrice - totalPaid, 2) || 0;
      await this.lessonDetailRepository.updatePrivateLessonTotals(
        privateLesson.id,
        total,
        balance,
      );
    }

    // 4. Update customer balance
    const customerId = await this.lessonDetailRepository.getCustomerIdByLesson(lesson.id);
    if (customerId) {
      await this.lessonConfirmationService.updateCustomerBalance(customerId);
    }

    // 5. Calculate and return updated cost values for UI display
    const netCost = this.lessonScheduleTransformationService.calculateNetCost(teacherRate, unit);
    const profit = this.lessonScheduleTransformationService.calculateProfit(
      displayedSubTotal,
      netCost,
    );

    return {
      costPerHour: formatCurrency(teacherRate),
      cost: formatCurrency(netCost),
      price: formatCurrency(displayedSubTotal),
      profit: formatCurrency(profit),
    };
  }
}
