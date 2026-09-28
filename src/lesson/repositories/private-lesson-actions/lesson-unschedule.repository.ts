import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { ReasonsToUnschedule } from '../../entities/reasons-to-unschedule.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { ItemTypeEnum } from '../../../invoice/enums/item-type.enum';
import { Note } from '../../../comment/entities/notes.entity';
import { Program } from '../../../program/entities/program.entity';

@Injectable()
export class LessonUnscheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    @InjectRepository(ReasonsToUnschedule)
    private readonly reasonsToUnscheduleRepository: Repository<ReasonsToUnschedule>,
  ) {}

  async lessonInvoiced(
    lessonId: number,
    programType: number,
    courseId: number,
  ): Promise<boolean> {
    if (programType === Program.TYPE_GROUP_PROGRAM) {
      return this.groupLessonInvoiced(lessonId, courseId);
    }

    return this.privateLessonInvoiced(lessonId);
  }

  // For private lessons, we check if the lesson itself has been invoiced.
  private async privateLessonInvoiced(lessonId: number): Promise<boolean> {
    const hasInvoice = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .leftJoin('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .leftJoin('invoiceLineItem.invoice', 'invoice')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoiceLineItem.isDeleted = :lineDeleted', {
        lineDeleted: false,
      })
      .andWhere('invoiceLineItem.itemTypeId = :itemTypeId', {
        itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .getCount();
    return hasInvoice > 0;
  }

  // Group lessons are invoiced via enrolments, so we need to check if any enrolment for the course has been invoiced.
  private async groupLessonInvoiced(
    lessonId: number,
    courseId: number,
  ): Promise<boolean> {
    const hasInvoice = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .innerJoin('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .innerJoin('invoiceLineItem.invoice', 'invoice')
      .innerJoin(
        'invoice_item_enrolment',
        'invoiceItemEnrolment',
        'invoiceItemEnrolment.invoiceLineItemId = invoiceLineItem.id',
      )
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.id = invoiceItemEnrolment.enrolmentId',
      )
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('enrolment.courseId = :courseId', { courseId })
      .andWhere('enrolment.isDeleted = :enrolmentDeleted', {
        enrolmentDeleted: false,
      })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoiceLineItem.isDeleted = :lineDeleted', {
        lineDeleted: false,
      })
      .andWhere('invoiceLineItem.itemTypeId = :itemTypeId', {
        itemTypeId: ItemTypeEnum.TYPE_GROUP_LESSON,
      })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .getCount();

    return hasInvoice > 0;
  }

  async getLessonsWithCourse(lessonIds: number[]): Promise<Lesson[]> {
    if (!lessonIds?.length) return [];
    return this.lessonRepository.find({
      where: { id: In(lessonIds), isDeleted: false },
      relations: ['course', 'course.program'],
    });
  }

  async createAndSaveNote(
    content: string,
    instanceId: number,
    createdByUserId: number,
  ): Promise<Note> {
    const note = this.noteRepository.create({
      content,
      instanceId,
      instanceType: Note.INSTANCE_TYPE_LESSON,
      createdUserId: createdByUserId,
    });
    return this.noteRepository.save(note);
  }

  async saveLesson(lesson: Lesson): Promise<Lesson> {
    return this.lessonRepository.save(lesson);
  }

  async findReasonsToUnschedule(): Promise<ReasonsToUnschedule[]> {
    return this.reasonsToUnscheduleRepository.find({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });
  }
}   
