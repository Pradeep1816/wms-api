import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Location } from '../../location/entities/location.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { getCurrentESTDate } from '../../utils/date-utils';

export interface InvoiceAllExpiredLessonsCronLocation {
  id: number;
  name: string;
  slug: string;
}

@Injectable()
export class InvoiceAllExpiredLessonsCronRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async getCronEnabledLocations(): Promise<InvoiceAllExpiredLessonsCronLocation[]> {
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
      .getRawMany<InvoiceAllExpiredLessonsCronLocation>();
  }

  async getExpiredPrivateLessonIds(locationId: number): Promise<number[]> {
    const now = getCurrentESTDate();

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course', 'course.isDeleted = 0')
      .innerJoin('course.program', 'program')
      .innerJoin('lesson.privateLesson', 'privateLesson')
      .select('lesson.id', 'id')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', {
        programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status = :unscheduledStatus', {
        unscheduledStatus: LessonStatusEnum.UNSCHEDULED,
      })
      .andWhere('lesson.status != :rescheduledStatus', {
        rescheduledStatus: LessonStatusEnum.RESCHEDULED,
      })
      .andWhere('privateLesson.expiryDate < :now', { now })
      .orderBy('lesson.id', 'ASC')
      .getRawMany<{ id: string | number }>();

    return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  }
}
