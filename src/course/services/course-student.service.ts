import { Injectable, BadRequestException } from '@nestjs/common';
import { CourseStudentRepository } from '../repositories/course-student.repository';
import { CourseStudentRequestDto } from '../dto/course-student-request.dto';
import { CourseStudentDataDto } from '../dto/course-student-response.dto';

@Injectable()
export class CourseStudentService {
  constructor(
    private readonly courseStudentRepository: CourseStudentRepository,
  ) {}

  /**
   * Get students enrolled in a course
   */
  async getCourseStudents(
    courseId: number,
    searchDto: CourseStudentRequestDto,
  ): Promise<CourseStudentDataDto> {
    try {
      const { page = 1, limit = 20 } = searchDto;

      const { students, total } = await this.courseStudentRepository.findStudentsByCourseId({
        courseId,
        page,
        limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        body: students,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getCourseStudents service:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve course students: ${error.message}`,
      );
    }
  }
}
