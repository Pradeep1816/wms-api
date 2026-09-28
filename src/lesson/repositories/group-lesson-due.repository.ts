import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupLesson } from '../entities/group-lesson.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { LessonStatusEnum } from '../enums/lesson-status';
import { IGroupLessonDueQueryRepository } from '../interfaces/group-lesson-due-repository.interface';

@Injectable()
export class GroupLessonDueRepository implements IGroupLessonDueQueryRepository {
  constructor(
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
  ) {}

  /**
   * Get group lesson dues by customer ID with pagination
   */
  async getGroupLessonDuesByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
    studentId?: number,
  ): Promise<{ groupLessonDues: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const currentDateTime = new Date();
    
    const queryBuilder = this.groupLessonRepository
    .createQueryBuilder('groupLesson')
      .leftJoinAndSelect('groupLesson.lesson', 'lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'userProfile')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .innerJoinAndSelect('groupLesson.enrolment', 'enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      // LEFT JOINs to check for invoiced status (without selecting the data)
      .leftJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .leftJoin('iil.invoiceLineItem', 'ili')
      .leftJoin('ili.invoice', 'inv')
      .leftJoin('invoice_item_enrolment', 'iie', 'iie.enrolmentId = enrolment.id')
      .leftJoin('iie.invoiceLineItem', 'lineItem')
      .leftJoin('lineItem.invoice', 'invoice')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :userId', { userId: customerId })
      .andWhere('groupLesson.isDeleted = false')
      .andWhere('groupLesson.balance > :balanceThreshold', { balanceThreshold: 0.09 })
      .andWhere('groupLesson.dueDate IS NOT NULL')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status <> :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('lesson.isDeleted = false')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      // Exclude invoiced lessons - where BOTH lesson invoice AND enrolment invoice exist and are not deleted
      // Legacy logic: exclude if (iil.id IS NOT NULL AND ili/inv not deleted) AND (iie.id IS NOT NULL AND lineItem/invoice not deleted)
      // So include if: NOT (lesson fully invoiced) OR NOT (enrolment fully invoiced)
      // Properly handle NULLs: use COALESCE to treat NULL as true (not invoiced/deleted = include)
      .andWhere(
        '(iil.id IS NULL OR COALESCE(ili.isDeleted, true) = true OR COALESCE(inv.isDeleted, true) = true OR ' +
        'iie.id IS NULL OR COALESCE(lineItem.isDeleted, true) = true OR COALESCE(invoice.isDeleted, true) = true)'
      )
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('groupLesson.id', 'ASC');

    // Apply optional student filter
    if (studentId) {
      queryBuilder.andWhere('enrolment.studentId = :studentId', { studentId });
    }

    // Optional due date range filter (inclusive). When not provided,
    // only show past-due lessons (dueDate < currentDateTime).
    // When both startDate and endDate are provided, filter by the requested range
    // and allow future lessons as well.
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      queryBuilder.andWhere('groupLesson.dueDate BETWEEN :startDate AND :endDate', {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
    } else {
      // Default behavior: only show past-due lessons
      queryBuilder.andWhere('groupLesson.dueDate < :currentDateTime', { currentDateTime: currentDateTime });
    }

    const [lessons, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { groupLessonDues: lessons, total };
  }
}
