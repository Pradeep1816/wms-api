import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { UnscheduledLessonRepository } from '../../lesson/repositories/unscheduled-lesson.repository';
import { StudentUnscheduledLessonsDataDto } from '../dto/student-unscheduled-lessons-response.dto';
import { StudentUnscheduledLessonsTransformationService } from './transformations/student-unscheduled-lessons-transformation.service';

@Injectable()
export class StudentUnscheduledLessonsService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly unscheduledLessonRepository: UnscheduledLessonRepository,
    private readonly studentUnscheduledLessonsTransformationService: StudentUnscheduledLessonsTransformationService,
  ) {}

  async getUnscheduledLessonsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
    page: number = 1,
    limit: number = 10,
    showAll: boolean = false,
  ): Promise<StudentUnscheduledLessonsDataDto> {
    try {
      // Validate student exists in location
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Get unscheduled lessons
      const { lessons, total } = await this.unscheduledLessonRepository.getUnscheduledLessonsByStudentId(
        studentId,
        locationId,
        page,
        limit,
        showAll,
      );

      // Structure unscheduled lessons data
      const transformedData = this.studentUnscheduledLessonsTransformationService.transformUnscheduledLessonsData(
        lessons,
        total,
        page,
        limit,
      );

      return transformedData;
    } catch (error) {
      console.error('Error in getUnscheduledLessonsByStudentId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student unscheduled lessons: ${error.message}`);
    }
  }
}
