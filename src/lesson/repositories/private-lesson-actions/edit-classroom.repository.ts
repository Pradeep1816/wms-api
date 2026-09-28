import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { ItemTypeEnum } from '../../../invoice/enums/item-type.enum';
import { LessonStatusEnum } from '../../enums/lesson-status';

/**
 * bulk Edit Classroom
  */
@Injectable()
export class EditClassroomRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async getInvoicedLessonIds(lessonIds: number[]): Promise<number[]> {
    if (!lessonIds?.length) return [];
    const rows = await this.lessonRepository.manager
      .createQueryBuilder()
      .select('iil.lessonId', 'lessonId')
      .from('invoice_item_lesson', 'iil')
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId')
      .innerJoin('invoice', 'i', 'i.id = ili.invoice_id')
      .where('iil.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('i.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('ili.isDeleted = :lineDeleted', { lineDeleted: false })
      .andWhere('ili.item_type_id = :privateLessonType', {
        privateLessonType: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      })
      .andWhere('i.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .getRawMany();
    return [...new Set((rows as { lessonId: number }[]).map((r) => r.lessonId))];
  }

  /**
   * Load lessons by ids with date and duration for overlap/unavailability checks.
   */
  async getLessonsByIds(
    lessonIds: number[],
    locationId?: number,
  ): Promise<Lesson[]> {
    if (!lessonIds?.length) return [];
    const qb = this.lessonRepository
      .createQueryBuilder('lesson')
      .select(['lesson.id', 'lesson.date', 'lesson.duration', 'lesson.classroomId'])
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false });

    if (locationId !== undefined) {
      qb.innerJoin('lesson.course', 'course').andWhere(
        'course.locationId = :locationId',
        { locationId },
      );
    }

    return qb.getMany();
  }

//check overlap
  async hasOverlappingLessonInClassroom(
    classroomId: number | null,
    lessonDateStr: string,
    startTime: string,
    endTime: string,
    excludeLessonId: number,
    locationId?: number,
  ): Promise<boolean> {
    const qb = this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.id != :excludeLessonId', { excludeLessonId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('DATE(lesson.date) = :lessonDate', { lessonDate: lessonDateStr })
      .andWhere(
        '(TIME(lesson.date) <= :endTime AND DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) > :startTime)',
        { startTime, endTime },
      );

    if (locationId !== undefined) {
      qb.innerJoin('lesson.course', 'course').andWhere(
        'course.locationId = :locationId',
        { locationId },
      );
    }

    if (classroomId == null) {
      qb.andWhere('lesson.classroomId IS NULL');
    } else {
      qb.andWhere('lesson.classroomId = :classroomId', { classroomId });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  //check unavailability
  async isClassroomUnavailable(
    classroomId: number | null,
    lessonDateStr: string,
  ): Promise<boolean> {
    const qb = this.lessonRepository.manager
      .createQueryBuilder()
      .select('1')
      .from('classroom_unavailability', 'cu')
      .andWhere('DATE(cu.fromDate) <= :lessonDate', { lessonDate: lessonDateStr })
      .andWhere('DATE(cu.toDate) >= :lessonDate', { lessonDate: lessonDateStr });
    if (classroomId == null) {
      qb.andWhere('cu.classroomId IS NULL');
    } else {
      qb.andWhere('cu.classroomId = :classroomId', { classroomId });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  //check unavailability for a range of dates
  async getUnavailableDatesForClassroom(
    classroomId: number | null,
    lessonDates: string[],
  ): Promise<Set<string>> {
    if (!lessonDates.length) {
      return new Set();
    }

    const sortedDates = [...lessonDates].sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];

    const qb = this.lessonRepository.manager
      .createQueryBuilder()
      .select('DATE(cu.fromDate)', 'fromDate')
      .addSelect('DATE(cu.toDate)', 'toDate')
      .from('classroom_unavailability', 'cu')
      .andWhere('DATE(cu.fromDate) <= :maxDate', { maxDate })
      .andWhere('DATE(cu.toDate) >= :minDate', { minDate });
    if (classroomId == null) {
      qb.andWhere('cu.classroomId IS NULL');
    } else {
      qb.andWhere('cu.classroomId = :classroomId', { classroomId });
    }
    const rows = await qb.getRawMany();

    const unavailable = new Set<string>();

    for (const d of lessonDates) {
      for (const row of rows as { fromDate: string; toDate: string }[]) {
        if (row.fromDate <= d && row.toDate >= d) {
          unavailable.add(d);
          break;
        }
      }
    }

    return unavailable;
  }

  /**
   * Bulk update lesson.classroomId for given lesson ids.
   * Pass classroomId null to clear classroom from selected lessons.
   */
  async updateClassroomForLessons(
    lessonIds: number[],
    classroomId: number | null,
  ): Promise<void> {
    if (!lessonIds?.length) return;
    await this.lessonRepository.update(
      { id: In(lessonIds) } as any,
      { classroomId } as Partial<Lesson>,
    );
  }
}
