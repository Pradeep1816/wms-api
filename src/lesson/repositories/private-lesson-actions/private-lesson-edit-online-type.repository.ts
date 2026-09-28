import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { getCurrentESTDate } from '../../../utils/date-utils';

/**
 * Repository for editing online type of private lessons.
 */
@Injectable()
export class PrivateLessonEditOnlineTypeRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Find lessons by IDs.
   * Legacy flow updates lesson records directly by id, without location/private_lesson constraints.
   */
  async findLessons(
    lessonIds: number[],
    _locationId: number,
  ): Promise<Lesson[]> {
    if (!lessonIds?.length) return [];
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  /**
   * Update is_online for the given lessons.
   */
  async updateOnlineType(
    lessonIds: number[],
    isOnline: number,
    userId: number,
  ): Promise<void> {
    await this.lessonRepository.update(
      { id: In(lessonIds) },
      {
        isOnline: isOnline === 1,
        updatedOn: getCurrentESTDate(),
        updatedByUserId: userId,
      },
    );
  }
}
