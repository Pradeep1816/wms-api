import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Location } from '../../location/entities/location.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { getCurrentESTDate } from '../../utils/date-utils';

export interface InvoiceAllCompletedLessonsCronLocation {
  id: number;
  name: string;
  slug: string;
}

export interface PrivateLessonCronCandidate {
  id: number;
  programRate: number;
}

@Injectable()
export class InvoiceAllCompletedLessonsCronRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async getCronEnabledLocations(): Promise<InvoiceAllCompletedLessonsCronLocation[]> {
    return this.locationRepository
      .createQueryBuilder('location')
      .select([
        'location.id AS id',
        'location.name AS name',
        'location.slug AS slug',
      ])
      .where('location.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('location.isEnabledCron = :isEnabledCron', { isEnabledCron: true })
      .orderBy('location.id', 'ASC')
      .getRawMany<InvoiceAllCompletedLessonsCronLocation>();
  }

  async getCompletedGroupLessonIds(locationId: number): Promise<number[]> {
    const now = getCurrentESTDate();

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course', 'course.isDeleted = 0')
      .innerJoin('course.program', 'program')
      .select('lesson.id', 'id')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', {
        programType: ProgramTypeEnum.GROUP_PROGRAM,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.date <= :now', { now })
      .orderBy('lesson.id', 'ASC')
      .getRawMany<{ id: string | number }>();

    return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  }

  async getCompletedUninvoicedPrivateLessons(
    locationId: number,
  ): Promise<PrivateLessonCronCandidate[]> {
    const now = getCurrentESTDate();

    const existingInvoiceSubquery = this.lessonRepository
      .createQueryBuilder('invoicedLesson')
      .subQuery()
      .select('1')
      .from('invoice_item_lesson', 'iil')
      .innerJoin(
        'invoice_line_item',
        'ili',
        'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0',
      )
      .innerJoin(
        'invoice',
        'invoice',
        'invoice.id = ili.invoice_id AND invoice.isDeleted = 0 AND invoice.type = :invoiceType',
      )
      .where('iil.lessonId = lesson.id')
      .getQuery();

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course', 'course.isDeleted = 0')
      .innerJoin('course.program', 'program')
      .innerJoin('lesson.privateLesson', 'privateLesson')
      .select('lesson.id', 'id')
      .addSelect('lesson.programRate', 'programRate')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', {
        programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.date <= :now', { now })
      .andWhere(`NOT EXISTS ${existingInvoiceSubquery}`)
      .setParameter('invoiceType', Invoice.TYPE_INVOICE)
      .orderBy('lesson.id', 'ASC')
      .getRawMany<{ id: string | number; programRate: string | number }>();

    return rows
      .map((row) => ({
        id: Number(row.id),
        programRate: Number(row.programRate),
      }))
      .filter((row) => Number.isFinite(row.id));
  }
}
