import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Course } from '../entities/course.entity';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class CourseLessonEditOnlineTypeRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  /**
   * Find course by ID and location
   */
  async findCourseById(courseId: number, locationId: number): Promise<Course | null> {
    return await this.courseRepository.findOne({
      where: {
        id: courseId,
        locationId: locationId,
        isDeleted: false,
      },
    });
  }

  /**
   * Find lessons by IDs and courseId
   */
  async findLessonsByIdsAndCourse(lessonIds: number[], courseId: number): Promise<Lesson[]> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  /**
   * Update is_online field for multiple lessons
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
