import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';

export interface CourseLessonResult {
  lessons: Lesson[];
  total: number;
}

export interface CourseLessonParams {
  courseId: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class CourseLessonRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get lessons for a specific course
   * Based on query:
   * SELECT * FROM `lesson`
   * WHERE (`courseId` = :courseId)
   *   AND (NOT(`lesson`.`status` = 4))
   *   AND (`lesson`.`isConfirmed` = TRUE)
   *   AND (`lesson`.`isDeleted` = FALSE)
   * ORDER BY `lesson`.`date`
   * LIMIT 200
   */
  async getLessonsByCourseId(
    locationId: number,
    params: CourseLessonParams,
  ): Promise<CourseLessonResult> {
    const { courseId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    try {
      const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false });

      // Get total count before pagination
      const total = await query.getCount();

      // Apply pagination and sorting
      query
        .orderBy('lesson.date', 'ASC')
        .skip(skip)
        .take(limit);

      // Execute query
      const lessons = await query.getMany();

      return { lessons, total };
    } catch (error) {
      console.error('Error in getLessonsByCourseId repository:', error);
      throw new Error(
        `Failed to fetch lessons for course ${courseId}: ${error.message}`,
      );
    }
  }
}
