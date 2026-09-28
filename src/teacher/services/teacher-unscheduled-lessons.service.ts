import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { TeacherUnscheduledLessonsResponseDto } from '../dto/teacher-unscheduled-lessons-response.dto';
import { TeacherUnscheduledLessonsRepository } from '../repositories/teacher-unscheduled-lessons.repository';
import { TeacherUnscheduledLessonsTransformationService } from './transformations/teacher-unscheduled-lessons-transformation.service';
import { plainToInstance } from 'class-transformer';
import { TeacherUnscheduledLessonsRequestDto } from '../dto/teacher-unscheduled-lessons-request.dto';

@Injectable()
export class TeacherUnscheduledLessonsService {
  constructor(
    private readonly repository: TeacherUnscheduledLessonsRepository,
    private readonly transformationService: TeacherUnscheduledLessonsTransformationService,
  ) {}

  async getTeacherUnscheduledLessons(
    locationId: number,
    teacherId: number,
    query: TeacherUnscheduledLessonsRequestDto,
  ): Promise<TeacherUnscheduledLessonsResponseDto> {
    try {
      const { showAll = false, page = 1, limit = 20 } = query;
      const { lessons, total } = await this.repository.findUnscheduledLessonsByTeacher(
        teacherId,
        locationId,
        showAll,
        page,
        limit,
      );

      const transformedLessons = this.transformationService.transformToResponse(lessons);
      const totalPages = Math.ceil(total / limit);

      const unscheduledLessonsData = plainToInstance(
        TeacherUnscheduledLessonsResponseDto,
        {
          body: transformedLessons,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        }
      );

      return unscheduledLessonsData;
    } catch (error) {
      console.error('Error in TeacherUnscheduledLessonsService:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher unscheduled lessons');
    }
  }
}

