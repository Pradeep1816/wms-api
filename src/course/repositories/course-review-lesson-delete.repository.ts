import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CourseProgramRate } from '../entities/course-program-rate.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class CourseReviewLessonDeleteRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(InvoiceItemLesson)
    private readonly invoiceItemLessonRepository: Repository<InvoiceItemLesson>,
  ) {}

  // Check if course exists in location
  async getCourse(courseId: number, locationId: number): Promise<boolean> {
    const count = await this.courseRepository.count({
      where: { id: courseId, locationId, isDeleted: false },
    });
    return count > 0;
  }

  /**
   * Find lesson by id and courseId (legacy only uses Lesson::findOne($id); we also require courseId for review context).
   * Location is validated separately via getCourse(courseId, locationId) so we do not filter by location here.
   */
  async getLessonForCourse(lessonId: number, courseId: number): Promise<Lesson | null> {
    return await this.lessonRepository.findOne({
      where: {
        id: lessonId,
        courseId,
        isDeleted: false,
      },
    });
  }

  /**
   * Consider a lesson invoiced if it has an invoice item lesson linked to
   * a non-deleted invoice line item and a non-deleted, non-canceled invoice.
   */
  async isLessonInvoiced(lessonId: number): Promise<boolean> {
    const invoiceItemLesson = await this.invoiceItemLessonRepository
      .createQueryBuilder('invoiceItemLesson')
      .innerJoin(InvoiceLineItem, 'invoiceLineItem', 'invoiceLineItem.id = invoiceItemLesson.invoiceLineItemId')
      .innerJoin(Invoice, 'invoice', 'invoice.id = invoiceLineItem.invoiceId')
      .where('invoiceItemLesson.lessonId = :lessonId', { lessonId })
      .andWhere('COALESCE(invoiceLineItem.isDeleted, 0) = 0')
      .andWhere('invoice.isDeleted = 0')
      .andWhere('invoice.isCanceled = 0')
      .getOne();

    return !!invoiceItemLesson;
  }

  async delete(lessonId: number, userId: number): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      {
        isDeleted: true,
        updatedOn: new Date(),
        updatedByUserId: userId,
      },
    );
  }

  /**
   * Recalculate programRate for all remaining (non-deleted) lessons in the course.
   * Matches legacy: Lesson::calcLessonPrice() after delete (splits course rate across lessons).
   */
  async recalcProgramRatesForCourse(courseId: number): Promise<void> {
    const courseProgramRate = await this.courseProgramRateRepository.findOne({
      where: { courseId },
      order: { startDate: 'DESC' },
    });
    const rate = Number(courseProgramRate?.programRate ?? 0);
    if (rate <= 0) return;

    const lessons = await this.lessonRepository.find({
      where: { courseId, isDeleted: false },
      order: { id: 'ASC' },
    });
    const lessonsCount = lessons.length;
    if (lessonsCount === 0) return;

    const pricePerLesson = RoundingUtils.roundDecimal(rate / lessonsCount, 2);
    const lastLessonPrice = RoundingUtils.roundDecimal(
      rate - pricePerLesson * (lessonsCount - 1),
      2,
    );

    for (let i = 0; i < lessons.length; i++) {
      const programRate = i === lessonsCount - 1 ? lastLessonPrice : pricePerLesson;
      await this.lessonRepository.update(
        { id: lessons[i].id },
        { programRate, updatedOn: new Date() },
      );
    }
  }
}
