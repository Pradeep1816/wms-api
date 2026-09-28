import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Course } from '../../course/entities/course.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { EnrolmentLessonRequestDto } from '../dto/enrolment-lesson-request.dto';

export interface GroupLessonListResult {
  lessons: any[];
  total: number;
}

@Injectable()
export class EnrolmentLessonRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
  ) {}

  /**
   * Validate enrolment exists and belongs to location
   * Also returns program type to determine query path
   */
  async findEnrolmentWithProgram(
    enrolmentId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = false')
      .getOne();
  }

  /**
   * Get lessons for PRIVATE program
   * Fixed limit: 12
   */
  async getPrivateLessons(courseId: number): Promise<any[]> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    return this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('private_lesson', 'privateLesson', 'privateLesson.lessonId = lesson.id')
      .select([
        'lesson.id as lessonId',
        'lesson.dueDate as dueDate',
        'lesson.date as date',
        'lesson.duration as duration',
        'lesson.status as status',
        'lesson.isPresent as isPresent',
        'lesson.isExploded as isExploded',
        'lesson.isOnline as online',
        'privateLesson.total as price',
        'privateLesson.balance as owing',
        'privateLesson.expiryDate as expiryDate',
      ])
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED] 
      })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.date >= :now', { now })
      .orderBy('lesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .limit(12)
      .getRawMany();
  }

  /**
   * Get lessons for GROUP program with pagination
   */
  async getGroupLessons(
    courseId: number,
    enrolmentId: number,
    query:EnrolmentLessonRequestDto,
  ): Promise<GroupLessonListResult> {
    const { page=1, limit=10 } = query;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const groupLessonQuery = this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .innerJoin('groupLesson.lesson', 'lesson')
      .select([
        'lesson.id as lessonId',
        'groupLesson.dueDate as dueDate',
        'lesson.date as date',
        'lesson.duration as duration',
        'lesson.status as status',
        'lesson.isPresent as isPresent',
        'lesson.isExploded as isExploded',
        'lesson.isOnline as online',
        'groupLesson.total as price',
        'groupLesson.balance as owing',
      ])
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('groupLesson.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED] 
      })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isDeleted = false')
      .andWhere('groupLesson.isDeleted = false')
      .andWhere('lesson.date >= :now', { now })
      .orderBy('groupLesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC');

    // Get total count
    const total = await groupLessonQuery.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    groupLessonQuery.offset(offset).limit(limit);

    const lessons = await groupLessonQuery.getRawMany();

    return { lessons, total };
  }
}
