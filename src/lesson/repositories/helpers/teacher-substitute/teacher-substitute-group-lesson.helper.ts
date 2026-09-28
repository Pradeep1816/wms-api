import { ensureGroupLessonEmailStatuses } from '../../../helpers/ensure-lesson-email-statuses';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { GroupLesson } from '../../../entities/group-lesson.entity';
import { GroupLessonEmailStatus } from '../../../entities/group-lesson-email-status.entity';
import { Enrolment } from '../../../../enrolment/entities/enrolment.entity';
import { Student } from '../../../../student/entities/student.entity';
import { NotificationEmailType } from '../../../../customer/entities/notification-email-type.entity';
import { LessonDiscount } from '../../../entities/lesson-discount.entity';
import { Lesson } from '../../../entities/lesson.entity';
import { LessonConfirmationService } from '../../../services/lesson-confirmation.service';
import { getCurrentESTDate } from 'src/utils/date-utils';
import { RoundingUtils } from '../../../../utils/rounding.utils';

@Injectable()
export class TeacherSubstituteGroupLessonHelper {
  constructor(
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(GroupLessonEmailStatus)
    private readonly groupLessonEmailStatusRepository: Repository<GroupLessonEmailStatus>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(NotificationEmailType)
    private readonly notificationEmailTypeRepository: Repository<NotificationEmailType>,
    private readonly lessonConfirmationService: LessonConfirmationService,
  ) {}

  /**
   * Mirrors legacy GroupLesson.beforeSave():
   *   total   = lesson.getGroupNetPrice(enrolment)  = (programRate - groupDiscount) + tax
   *   balance = total - creditApplied               = total (new lesson has no payments)
   *   paidStatus derived from balance
   */
  private calculateGroupLessonAmounts(
    lesson: Lesson,
    groupDiscount: number,
    creditApplied: number,
  ): { total: number; balance: number; paidStatus: number } {
    // Legacy: grossPrice for GROUP = programRate (NOT programRate * unit)
    const grossPrice = RoundingUtils.decimal(lesson.programRate ?? 0);
    const total = RoundingUtils.roundDecimal(
      grossPrice.minus(groupDiscount).plus(lesson.tax ?? 0),
      2,
    );
    const balance = RoundingUtils.roundDecimal(total - creditApplied, 2);

    // Legacy GroupLesson.getStatus()
    let paidStatus: number;
    if (balance === 0) {
      paidStatus = GroupLesson.STATUS_PAID;
    } else if (balance < 0) {
      paidStatus = GroupLesson.STATUS_CREDIT;
    } else {
      paidStatus = GroupLesson.STATUS_OWING;
    }

    return { total, balance, paidStatus };
  }

  /**
   * Create GroupLesson records for all enrolments in course.
   * Mirrors legacy LessonReschedule::save() group lesson block + GroupLesson.beforeSave().
   * Must be called with manager so all DB access runs in the same transaction.
   */
  async createGroupLessonsForAllEnrolments(
    oldLessonId: number,
    newLessonId: number,
    courseId: number,
    manager: EntityManager,
  ): Promise<void> {
    const groupLessonRepo = manager.getRepository(GroupLesson);
    const enrolmentRepo = manager.getRepository(Enrolment);
    const lessonDiscountRepo = manager.getRepository(LessonDiscount);
    const lessonRepo = manager.getRepository(Lesson);

    // Load new lesson to get programRate and tax for price calculation
    const newLesson = await lessonRepo.findOne({ where: { id: newLessonId } });
    if (!newLesson) {
      throw new Error(`New lesson ${newLessonId} not found`);
    }
    const now = getCurrentESTDate();
    const createdByUserId = Number(newLesson.createdByUserId ?? 0);
    const updatedByUserId = Number(newLesson.updatedByUserId ?? createdByUserId);

    // Get old lesson's group lesson to copy dueDate
    const oldGroupLesson = await groupLessonRepo.findOne({
      where: { lessonId: oldLessonId, isDeleted: false },
    });

    // Legacy: confirmed + notDeleted enrolments for this course
    const enrolments = await enrolmentRepo.find({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: 1, // number type — 0 unconfirmed, 1 confirmed
      },
      relations: ['student'],
    });

    const groupLessons: GroupLesson[] = [];
    const customerIds = new Set<number>();

    for (const enrolment of enrolments) {
      // Legacy: getGroupDiscount(enrolment) — lesson_discount type=5 (TYPE_GROUP) for this enrolment
      const groupDiscountRecord = await lessonDiscountRepo.findOne({
        where: {
          lessonId: newLessonId,
          enrolmentId: enrolment.id,
          type: LessonDiscount.TYPE_GROUP, // = 5
        },
      });

      // Calculate discount value (legacy: percentage or fixed)
      let groupDiscountValue = 0;
      if (groupDiscountRecord) {
        if (groupDiscountRecord.valueType) {
          // Percentage
          groupDiscountValue = RoundingUtils.roundDecimal(
            RoundingUtils.decimal(newLesson.programRate ?? 0)
              .times(groupDiscountRecord.value ?? 0)
              .dividedBy(100),
            4,
          );
        } else {
          // Fixed
          groupDiscountValue =
            Number(newLesson.programRate) < 0
              ? 0
              : RoundingUtils.decimal(groupDiscountRecord.value ?? 0).toNumber();
        }
      }

      // New substitute lesson has no payments yet → creditApplied = 0
      const { total, balance, paidStatus } = this.calculateGroupLessonAmounts(
        newLesson,
        groupDiscountValue,
        0,
      );

      groupLessons.push(
        groupLessonRepo.create({
          lessonId: newLessonId,
          enrolmentId: enrolment.id,
          dueDate: oldGroupLesson?.dueDate ?? new Date(),
          isDeleted: false,
          total,
          balance,
          paidStatus,
          createdOn: now,
          updatedOn: now,
          createdByUserId,
          updatedByUserId,
        }),
      );

      // Collect customerIds for balance update after save (legacy: GroupLesson.afterSave)
      if (enrolment.student?.customerId) {
        customerIds.add(enrolment.student.customerId);
      }
    }

    if (groupLessons.length > 0) {
      await groupLessonRepo.save(groupLessons);
    }

    // Legacy: GroupLesson.afterSave → enrolment.customer.updateCustomerBalance()
    for (const customerId of customerIds) {
      await this.lessonConfirmationService.updateCustomerBalance(customerId);
    }
  }

  /**
   * Create GroupLessonEmailStatus records for all active students.
   * Mirrors legacy TeacherSubstituteController::actionConfirm() email status block.
   * Must be called with manager so all DB access runs in the same transaction.
   */
  async createGroupLessonEmailStatuses(
    lessonId: number,
    courseId: number,
    manager: EntityManager,
  ): Promise<void> {
    const emailStatusRepo = manager.getRepository(GroupLessonEmailStatus);
    const studentRepo = manager.getRepository(Student);

    const today = new Date().toISOString().split('T')[0];

    // Legacy groupCourseEnrolled():
    //   - course confirmed + not deleted
    //   - enrolment isConfirmed + not deleted + studentId not null
    //   - enrolment.endDateTime >= today  ← active enrolments only
    //   - student not deleted
    const students = await studentRepo
      .createQueryBuilder('student')
      .innerJoin('student.enrolments', 'enrolment')
      .innerJoin('enrolment.course', 'course')
      .where('enrolment.courseId = :courseId', { courseId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .andWhere('enrolment.studentId IS NOT NULL')
      .andWhere('DATE(enrolment.endDateTime) >= :today', { today })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: 1 })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('student.isDeleted = :studentIsDeleted', { studentIsDeleted: false })
      .getMany();

    await ensureGroupLessonEmailStatuses(
      emailStatusRepo,
      lessonId,
      students.map(student => student.id),
    );
  }
}
