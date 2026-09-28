import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { ScheduleInfo } from '../dto/lesson-details-response.dto';
import { LessonScheduleTransformationService } from '../services/transformation/lesson-schedule-transformation.service';

@Injectable()
export class LessonScheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    private readonly transformationService: LessonScheduleTransformationService,
  ) {}

  // Get schedule information for a lesson
  async getSchedule(lessonId: number): Promise<ScheduleInfo | null> {
    const result = await this.getScheduleData(lessonId);

    if (!result) {
      return null;
    }

    return this.transformationService.transformToScheduleInfo(result);
  }

  // Get due date for a lesson
  async getDueDate(lessonId: number): Promise<string | null> {
    const lesson = await this.getScheduleData(lessonId);
    
    if (!lesson) {
      return null;
    }
    return this.transformationService.formatDueDate(lesson);
  }

  private async getScheduleData(lessonId: number): Promise<Lesson | null> {
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = false')
      .getOne();
  }
}
