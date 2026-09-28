import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { GroupLessonRepository } from '../repositories/group-lesson.repository';
import { GroupLessonRequestDto } from '../dto/group-lesson-request.dto';
import { GroupLessonDto, GroupLessonsDataDto } from '../dto/group-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../utils/date-utils';
import { formatDuration } from '../../utils/formatters';
import { getStatus } from '../enums/lesson-status';

@Injectable()
export class GroupLessonService {
  constructor(
    private readonly groupLessonRepository: GroupLessonRepository,
  ) {}

  async getGroupLessonsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: GroupLessonRequestDto,
  ): Promise<GroupLessonsDataDto> {
    try {
      // Get location
      const location = await this.groupLessonRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new NotFoundException(`Location not found: ${locationSlug}`);
      }

      // Get customer
      const customer = await this.groupLessonRepository.findCustomerByIdAndLocation(
        customerId,
        location.id,
      );
      if (!customer) {
        throw new NotFoundException(`Customer not found: ${customerId}`);
      }


      // Get group lessons with pagination
      const { groupLessons, total } = await this.groupLessonRepository.getGroupLessonsByCustomerId(
        customerId,
        location.id,
        query.page,
        query.limit,
      );

      // Transform group lessons to DTOs
      const groupLessonData: GroupLessonDto[] = groupLessons.map(groupLesson => 
        this.transformGroupLessonToDto(groupLesson, locationSlug)
      );

      // Calculate pagination
      const { page = 1, limit = 10 } = query;
      const totalPages = Math.ceil(total / limit);

      return {
        body: groupLessonData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getGroupLessonsByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve group lessons: ${error.message}`);
    }
  }


  /**
   * Transform group lesson to DTO
   */
  private transformGroupLessonToDto(groupLesson: any, locationSlug: string): GroupLessonDto {
    // Get student name from enrolment.student
    const studentName = 
      `${groupLesson.enrolment?.student?.firstName || ''} ${groupLesson.enrolment?.student?.lastName || ''}`.trim();

    
    // Get program name from lesson.course.program
    const programName = groupLesson.lesson?.course?.program?.name || '';

    // Format date
    const lessonDate = new Date(groupLesson.lesson?.date);
    const date = formatDateWithTime(lessonDate);

    // Get status text
    const status = getStatus(groupLesson.lesson) || '';

    return {
      dueDate: formatDate(groupLesson.dueDate),
      studentName: studentName,
      lessonId: groupLesson.lesson?.id || null,
      url: `admin/${locationSlug}/group-lessons/${groupLesson.lesson?.id || ''}`,
      programName: programName,
      date: date,
      duration: formatDuration(groupLesson.lesson?.duration),
      status: status,
      price: parseFloat(groupLesson.total?.toString() || '0'),
      owing: parseFloat(groupLesson.balance?.toString() || '0'),
    };
  }
}
