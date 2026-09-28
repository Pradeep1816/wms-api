import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { PrivateLessonRepository } from '../../lesson/repositories/private-lesson.repository';
import { GroupLessonRepository } from '../../lesson/repositories/group-lesson.repository';
import { StudentPrivateLessonsDataDto, StudentGroupLessonsDataDto } from '../dto/student-lessons-response.dto';
import { StudentPrivateLessonsTransformationService } from './transformations/student-lessons-transformation.service';

@Injectable()
export class StudentPrivateLessonsService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly privateLessonRepository: PrivateLessonRepository,
    private readonly groupLessonRepository: GroupLessonRepository,
    private readonly studentPrivateLessonsTransformationService: StudentPrivateLessonsTransformationService,
  ) {}

  async getPrivateLessonsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
  ): Promise<StudentPrivateLessonsDataDto> {
    try {
      // Get student
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      const lessons = await this.privateLessonRepository.getPrivateLessonsByStudentId(
        studentId,
        locationId,
      );

      const transformedData = this.studentPrivateLessonsTransformationService.transformPrivateLessonsData(lessons);

      return transformedData;
    } catch (error) {
      console.error('Error in getPrivateLessonsByStudentId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student private lessons: ${error.message}`);
    }
  }

  async getGroupLessonsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
    page: number = 1,
    limit: number = 2,
  ): Promise<StudentGroupLessonsDataDto> {
    try {
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      const { lessons, total } = await this.groupLessonRepository.getGroupLessonsByStudentId(
        studentId,
        locationId,
        page,
        limit,
      );

      const transformedData = this.studentPrivateLessonsTransformationService.transformGroupLessonsData(
        lessons,
        total,
        page,
        limit,
      );

      return transformedData;
    } catch (error) {
      console.error('Error in getGroupLessonsByStudentId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student group lessons: ${error.message}`);
    }
  }
}
