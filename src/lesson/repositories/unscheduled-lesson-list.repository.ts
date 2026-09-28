import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { UnscheduledLessonListRequestDto } from '../dto/unscheduled-lesson-list-request.dto';
import { LessonStatusEnum } from '../enums/lesson-status';
import { formatDateToEasternString } from '../../utils/formatters';

export interface UnscheduledLessonListResult {
  lessons: Lesson[];
  total: number;
}

@Injectable()
export class UnscheduledLessonListRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get unscheduled lessons with filters and pagination
   */
  async getUnscheduledLessons(
    locationId: number,
    searchDto: UnscheduledLessonListRequestDto,
  ): Promise<UnscheduledLessonListResult> {
    const { page = 1, limit = 20, showAll = false, showInactive = false } = searchDto;
    const skip = (page - 1) * limit;

    try {
      const query = this.buildBaseQuery(locationId, showInactive);
      
      // Apply filters
      this.applySearchFilters(query, searchDto);

      // Get total count before pagination
      const total = await query.getCount();

      // Apply pagination only if showAll is false
      if (!showAll) {
        query.skip(skip).take(limit);
      }

      // Execute query
      const lessons = await query.getMany();

      return { lessons, total };
    } catch (error) {
      console.error('Error in getUnscheduledLessons repository:', error);
      throw new Error(`Failed to fetch unscheduled lessons for location ${locationId}: ${error.message}`);
    }
  }

  private buildBaseQuery(locationId: number, showInactive: boolean): SelectQueryBuilder<Lesson> {
    const today = formatDateToEasternString();
    
    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.course', 'course', 'course.isDeleted = :courseDeletedJoin', { courseDeletedJoin: false })
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: LessonStatusEnum.UNSCHEDULED })
      .andWhere('privateLesson.lessonId IS NOT NULL')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false });

    // Only filter by expiry date when NOT showing inactive (expired) lessons
    if (!showInactive) {
      query.andWhere('DATE(privateLesson.expiryDate) > :today', { today });
    }

    query.orderBy('privateLesson.expiryDate', 'ASC');
    
    return query;
  }

  /**
   * Apply search filters (student, program, teacher)
   */
  private applySearchFilters(
    query: SelectQueryBuilder<Lesson>,
    searchDto: UnscheduledLessonListRequestDto,
  ): void {
    if (searchDto.student?.trim()) {
      query.andWhere(
        "CONCAT(student.firstName, ' ', student.lastName) LIKE :studentName",
        { studentName: `%${searchDto.student.trim()}%` },
      );
    }

    if (searchDto.program?.trim()) {
      query.andWhere('program.name LIKE :programName', {
        programName: `%${searchDto.program.trim()}%`,
      });
    }

    const teacherSearch = searchDto.teacher?.trim();
    if (teacherSearch) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('teacherProfile.firstname LIKE :teacherName', {
            teacherName: `%${teacherSearch}%`,
          }).orWhere('teacherProfile.lastname LIKE :teacherName', {
            teacherName: `%${teacherSearch}%`,
          });
        }),
      );
    }
  }

}

