import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrivateLessonRepository } from '../repositories/private-lesson.repository';
import { PrivateLessonRequestDto } from '../dto/private-lesson-request.dto';
import { PrivateLessonDto, PrivateLessonsDataDto } from '../dto/private-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../utils/date-utils';
import { formatDuration } from '../../utils/formatters';
import { getStatus } from '../enums/lesson-status';

@Injectable()
export class PrivateLessonService {
  constructor(
    private readonly privateLessonRepository: PrivateLessonRepository,
  ) {}

  async getPrivateLessonsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: PrivateLessonRequestDto,
  ): Promise<PrivateLessonsDataDto> {
    try {
      // Get location
      const location = await this.privateLessonRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new NotFoundException(`Location not found: ${locationSlug}`);
      }

      // Get customer
      const customer = await this.privateLessonRepository.findCustomerByIdAndLocation(
        customerId,
        location.id,
      );
      if (!customer) {
        throw new NotFoundException(`Customer not found: ${customerId}`);
      }

      // Get private lessons with pagination
      const { privateLessons, total } = await this.privateLessonRepository.getPrivateLessonsByCustomerId(
        customerId,
        location.id,
        query.page,
        query.limit,
      );

      // Transform private lessons to DTOs
      const privateLessonData: PrivateLessonDto[] = privateLessons.map(privateLesson => 
        this.transformPrivateLessonToDto(privateLesson, locationSlug)
      );

      // Calculate pagination
      const { page = 1, limit = 10 } = query;
      const totalPages = Math.ceil(total / limit);

      return {
        body: privateLessonData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getPrivateLessonsByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve private lessons: ${error.message}`);
    }
  }

  /**
   * Transform lesson with private lesson to DTO
   */
  private transformPrivateLessonToDto(lesson: any, locationSlug: string): PrivateLessonDto {


    const privateLesson = lesson.privateLesson?.[0]; // Get first private lesson since it's an array
    const student = lesson?.course?.enrolments?.[0]?.student;
    const program = lesson?.course?.program;

    // Get student name from profile
    const studentName = 
      `${student?.firstName || ''} ${student?.lastName || ''}`.trim();

    // Get program name
    const programName = program?.name || '';

    // Format date
    const lessonDate = new Date(lesson.date);
    const date = formatDateWithTime(lessonDate);

    // Get status text
    const status = getStatus(lesson) || '';

    return { 
      dueDate: formatDate(lesson?.dueDate),
      studentId: student?.id || null,
      studentName: studentName,
      lessonId: lesson?.id || null,
      url: `admin/${locationSlug}/private-lessons/${lesson?.id || ''}`,
      programName: programName,
      date: date,
      duration: formatDuration(lesson.duration),
      status: status,
      price: parseFloat(privateLesson?.total?.toString() || '0'),
      owing: parseFloat(privateLesson?.balance?.toString() || '0'),
    };
  }

}
