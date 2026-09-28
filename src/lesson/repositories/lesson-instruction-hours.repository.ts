import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';

@Injectable()
export class LessonInstructionHoursRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async getInstructionHours(locationId: number, fromDateTime: string, toDateTime: string): Promise<Array<{ name: string; hours: string; type: number }>> {
    const queryBuilder = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('course', 'course', 'lesson.courseId = course.id AND course.isDeleted = :isDeleted', { isDeleted: false })
      .leftJoin('program', 'program', 'course.programId = program.id')
      .select([
        'program.name as name',
        'SUM(TIME_TO_SEC(lesson.duration)) as hours',
        'lesson.type as type',
      ])
      .where('lesson.date BETWEEN :fromDateTime AND :toDateTime', { 
        fromDateTime, 
        toDateTime, 
      })
      .andWhere('lesson.status IN (:...statuses)', { statuses: [2, 1] })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('course.locationId = :locationId', { locationId })
      .groupBy('course.programId, program.name, lesson.type')
      .orderBy('hours', 'DESC');

    return queryBuilder.getRawMany();
  }
}


