import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { IPrivateLessonDueQueryRepository } from '../interfaces/private-lesson-due-repository.interface';

@Injectable()
export class PrivateLessonDueRepository implements IPrivateLessonDueQueryRepository {
  constructor(
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get private lesson dues by customer ID with pagination
   */
  async getPrivateLessonDuesByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
    studentId?: number,
  ): Promise<{ privateLessonDues: any[]; total: number }> {
    const offset = (page - 1) * limit;
    
    // Subquery to find invoiced lessons
    const subQuery = this.lessonRepository
      .createQueryBuilder('invoicedLesson')
      .subQuery()
      .select('invoicedLesson.id')
      .from('lesson', 'invoicedLesson')
      .innerJoin('invoicedLesson.invoiceItemLessons', 'invoiceItemLesson')
      .innerJoin('invoiceItemLesson.invoiceLineItem', 'invoiceLineItem')
      .innerJoin('invoiceLineItem.invoice', 'invoice')
      .innerJoin('invoicedLesson.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('course.enrolments', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .where('invoicedLesson.isDeleted = false')
      .andWhere('invoicedLesson.isConfirmed = true')
      .andWhere('invoicedLesson.status <> :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('program.type = :type', { type: ProgramTypeEnum.PRIVATE_PROGRAM })
      .andWhere('course.isDeleted = false')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('student.customerId = :userId', { userId: customerId })
      .andWhere('enrolment.id IS NOT NULL')
      .getQuery();

    const queryBuilder = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .leftJoinAndSelect('lesson.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .innerJoinAndSelect('course.enrolments', 'enrolments')
      .innerJoinAndSelect('enrolments.student', 'student')
      .where(`lesson.id NOT IN ${subQuery}`)
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status <> :status', { status: LessonStatusEnum.CANCELED })
      .andWhere('privateLesson.balance > 0')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :type', { type: ProgramTypeEnum.PRIVATE_PROGRAM })
      .andWhere('student.customerId = :userId', { userId: customerId })
      .setParameters({
        userId: customerId,
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .orderBy('lesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC');

    // Apply optional student filter
    if (studentId) {
      queryBuilder.andWhere('enrolments.studentId = :studentId', { studentId });
    }

    // Date filtering:
    // - Default behaviour (no start/end): keep existing logic (only past-due lessons).
    // - When both startDate and endDate are provided: filter by the requested range and
    //   allow future lessons as well.
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      queryBuilder.andWhere('lesson.dueDate BETWEEN :startDate AND :endDate', {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
    } else {
      queryBuilder.andWhere('lesson.dueDate < :now', {
        now: new Date().toISOString(),
      });
    }

    const [lessons, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { privateLessonDues: lessons, total };
  }
}
