import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { AbsentLessonRepository } from '../../lesson/repositories/absent-lesson.repository';
import { StudentAbsentLessonsDataDto } from '../dto/student-absent-lessons-response.dto';
import { StudentAbsentLessonsTransformationService } from './transformations/student-absent-lessons-transformation.service';

@Injectable()
export class StudentAbsentLessonsService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly absentLessonRepository: AbsentLessonRepository,
    private readonly studentAbsentLessonsTransformationService: StudentAbsentLessonsTransformationService,
  ) {}

  async getAbsentLessonsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<StudentAbsentLessonsDataDto> {
    try {
      // Validate student exists in location
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Get absent
      const { lessons, total } = await this.absentLessonRepository.getAbsentLessonsByStudentId(
        studentId,
        locationId,
        page,
        limit,
      );

      // Structure absent lessons data
      const transformedData = this.studentAbsentLessonsTransformationService.transformAbsentLessonsData(
        lessons,
        total,
        page,
        limit,
      );

      return transformedData;
    } catch (error) {
      console.error('Error in getAbsentLessonsByStudentId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student absent lessons: ${error.message}`);
    }
  }
}
