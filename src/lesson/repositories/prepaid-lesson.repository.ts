import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { Invoice } from '../../invoice/entities/invoice.entity';

@Injectable()
export class PrepaidLessonRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get prepaid private lessons for a customer
   * Prepaid lessons are private lessons that have payments but are NOT invoiced
   * Returns raw lesson data, payment map (lessonId -> total paid amount), and total amount paid
   */
  async getPrePaidLessons(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ lessons: Lesson[]; paymentMap: Record<number, number>; totalAmount: number; total: number }> {
    const offset = (page - 1) * limit;
    // Step 1: Optimized subquery - Get invoiced private lessons for customer
    // Filter by customer early to reduce dataset
    const invoicedLessonsSubQueryBuilder = this.lessonRepository
      .createQueryBuilder('lesson')
      .subQuery()
      .select('DISTINCT lesson.id', 'id')
      .from('lesson', 'lesson')
      .innerJoin('lesson.invoiceItemLessons', 'invoiceItemLesson')
      .innerJoin('invoiceItemLesson.invoiceLineItem', 'invoiceLineItem')
      .innerJoin('invoiceLineItem.invoice', 'invoice')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('course.enrolments', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .where('student.customerId = :userId', { userId }) // Filter early by customer
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = 1') // TYPE_PRIVATE_PROGRAM
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE });

    const invoicedLessonsSubQuery = invoicedLessonsSubQueryBuilder.getQuery();

    // Step 2: Main query - Get pre-paid lessons
    // Filter by customer early and use DISTINCT to avoid duplicates from multiple enrolments
    const mainQuery = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoinAndSelect('lesson.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .innerJoin('course.enrolments', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoinAndSelect('enrolment.student', 'studentSelect') // Select only one enrolment's student
      .leftJoin('lesson_payment', 'lp', 'lp.lessonId = lesson.id AND lp.isDeleted = false')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoin(`(${invoicedLessonsSubQuery})`, 'invoiced', 'invoiced.id = lesson.id')
      .where('student.customerId = :userId', { userId }) // Filter early by customer
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = 1') // TYPE_PRIVATE_PROGRAM
      .andWhere('lp.id IS NOT NULL') // Has payment
      .andWhere('invoiced.id IS NULL') // NOT invoiced
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true');

    // Merge subquery parameters into main query
    mainQuery.setParameters(invoicedLessonsSubQueryBuilder.getParameters());

    const [lessons, total] = await mainQuery
      .orderBy('lesson.date', 'ASC')
      .distinct(true) // Avoid duplicates from multiple enrolments per course
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Step 3: Calculate total and payment map (simplified - just sum payments for these lessons)
    const lessonIds = lessons.map((l) => l.id);
    let totalAmount = 0;
    let paymentMap: Record<number, number> = {};

    if (lessonIds.length > 0) {
      const paymentResults = await this.dataSource
        .createQueryBuilder()
        .select('lp.lessonId', 'lessonId')
        .addSelect('SUM(lp.amount)', 'totalPaid')
        .from('lesson_payment', 'lp')
        .where('lp.lessonId IN (:...ids)', { ids: lessonIds })
        .andWhere('lp.isDeleted = false')
        .groupBy('lp.lessonId')
        .getRawMany<{ lessonId: number; totalPaid: string | number }>();

      // Build payment map and calculate total
      paymentMap = Object.fromEntries(
        paymentResults.map((row) => {
          const paid = Number(row.totalPaid || 0);
          totalAmount += paid;
          return [row.lessonId, paid];
        }),
      );
    }

    return { lessons, paymentMap, totalAmount, total };
  }
}

