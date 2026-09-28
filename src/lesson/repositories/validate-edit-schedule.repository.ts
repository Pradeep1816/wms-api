import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';

@Injectable()
export class ValidateEditScheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Find lesson by ID and location ID with course, program, enrolments (for edit-schedule validation).
   */
  async findByIdAndLocationId(
    id: number,
    locationId: number,
  ): Promise<Lesson | null> {
    const lesson = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolments')
      .leftJoinAndSelect('enrolments.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.customerAccount', 'customerAccount')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .where('lesson.id = :id', { id })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
    return lesson ?? null;
  }

  /**
   * Check if a lesson is linked to any non-deleted invoice (invoiced).
   */
  async isLessonInvoiced(lessonId: number): Promise<boolean> {
    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .innerJoin(
        'invoice_line_item',
        'invoiceLineItem',
        'invoiceLineItem.id = iil.invoiceLineItemId',
      )
      .innerJoin(
        'invoice',
        'invoice',
        'invoice.id = invoiceLineItem.invoice_id',
      )
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoiceLineItem.isDeleted = :lineItemDeleted', {
        lineItemDeleted: false,
      })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .andWhere('invoiceLineItem.item_type_id IN (:...itemTypes)', {
        itemTypes: [
          ItemTypeEnum.TYPE_PRIVATE_LESSON,
          ItemTypeEnum.TYPE_GROUP_LESSON,
        ],
      })
      .getCount();
    return count > 0;
  }
}
