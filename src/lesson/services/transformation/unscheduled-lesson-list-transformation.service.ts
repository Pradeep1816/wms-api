import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Lesson } from '../../entities/lesson.entity';
import { UnscheduledLessonListItemDto, UnscheduledLessonListDataDto } from '../../dto/unscheduled-lesson-list-response.dto';
import { formatDateWithTime, formatDate } from '../../../utils/date-utils';
import { formatDuration } from '../../../utils/formatters';

@Injectable()
export class UnscheduledLessonListTransformationService {
  /**
   * Transform a single lesson entity to DTO
   */
  transformToDto(lesson: Lesson): UnscheduledLessonListItemDto {
    const enrolment = lesson.course?.enrolments?.[0];
    const studentData = enrolment?.student;
    const teacherData = lesson.teacher;
    const programData = lesson.course?.program;
    const privateLesson = lesson.privateLesson?.[0];

    // Format date using dayjs UTC to avoid timezone issues
    const formattedDate = lesson.date ? formatDate(new Date(lesson.date)) : null;
    
    // Format expiry date
    const formattedExpiryDate = privateLesson?.expiryDate 
      ? formatDate(new Date(privateLesson.expiryDate)) 
      : null;

    // Format duration as HH:mm
    const durationFormatted = lesson.duration
      ? formatDuration(lesson.duration)
      : '00:00';

    // Get student name
    const studentName = studentData
      ? `${studentData.firstName} ${studentData.lastName}`.trim()
      : null;

    // Get teacher name
    const teacherName = teacherData?.profile
      ? `${teacherData.profile.firstname} ${teacherData.profile.lastname}`.trim()
      : null;

    const dtoData = {
      id: lesson.id,
      status: lesson.getStatus() || 'Unknown',
      student: studentName,
      program: programData?.name || null,
      teacher: teacherName,
      duration: durationFormatted,
      date: formattedDate,
      expiryDate: formattedExpiryDate,
      type: lesson.type,
    };

    return plainToInstance(UnscheduledLessonListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple lesson entities to DTOs
   */
  transformLessonsToDtos(lessons: Lesson[]): UnscheduledLessonListItemDto[] {
    return lessons.map((lesson) => this.transformToDto(lesson));
  }

  /**
   * Transform lessons data to UnscheduledLessonListDataDto
   */
  transformLessonsData(
    lessons: Lesson[],
    total: number,
    page: number,
    limit: number,
  ): UnscheduledLessonListDataDto {
    const formattedLessons = this.transformLessonsToDtos(lessons);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedLessons,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(UnscheduledLessonListDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}

