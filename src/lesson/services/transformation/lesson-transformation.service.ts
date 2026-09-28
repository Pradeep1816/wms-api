import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { LessonEditScheduleDataDto, LessonEditScheduleResponseDto, LessonDto, PrivateLessonDto } from '../../dto/lesson-edit-schedule-response.dto';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { formatDuration } from '../../../utils/formatters';
import { formatDate, formatDateTime } from '../../../utils/date-utils';
import { getScheduleLessonClassName } from '../../../utils/helper';
import { getStatus } from '../../enums/lesson-status';

@Injectable()
export class LessonTransformationService {
  /**
   * Transform lesson entity to DTO for edit schedule form
   */
  transformToDto(lesson: any): LessonEditScheduleResponseDto {
    // Format date: return null if status is UNSCHEDULED or date is null, otherwise format the date
    let formattedDate: string | null = null;
    if (lesson.status !== LessonStatusEnum.UNSCHEDULED && lesson.date) {
      formattedDate = formatDateTime(lesson.date);
    }

    // Format duration as "HH:MM" (same as teacher-unscheduled-lessons)
    const duration = formatDuration(lesson.duration);

    // Get root lesson from hierarchy if available
    const hierarchy = lesson.lessonHierarchy;
    const rootLesson = hierarchy?.[0]?.lesson || null;

    // Get className using common helper function
    const className = getScheduleLessonClassName(lesson, rootLesson);

    // Build lesson DTO
    const lessonDto = plainToInstance(LessonDto, {
      id: lesson.id,
      teacherId: lesson.teacherId,
      programId: lesson.course?.programId || '',
      date: formattedDate,
      duration: duration,
      classroomId: lesson.classroomId || '',
      statusCode: lesson.status,
      status: getStatus(lesson) || '',
      isOnline: lesson.isOnline || false,
      isPresent: lesson.isPresent || false,
      className: className,
      backgroundColor: lesson.colorCode || '',
    }, { excludeExtraneousValues: true });

    // Build response data
    const responseData: any = {
      lesson: lessonDto,
      privateLesson: null,
    };

    // Add privateLesson data if it exists (same pattern as teacher-unscheduled-lessons)
    const privateLesson = lesson.privateLesson?.[0] || null;
    if (privateLesson) {
      const expiryDate = privateLesson.expiryDate
        ? formatDate(privateLesson.expiryDate)
        : null;
      
      const privateLessonDto = plainToInstance(PrivateLessonDto, {
        id: String(privateLesson.id),
        expiryDate: expiryDate,
        total: parseFloat(privateLesson.total?.toString() || '0'),
        balance: parseFloat(privateLesson.balance?.toString() || '0'),
      }, { excludeExtraneousValues: true });
      
      responseData.privateLesson = privateLessonDto;
    }

    const dataDto = plainToInstance(LessonEditScheduleDataDto, responseData, { excludeExtraneousValues: true });
    
    return plainToInstance(LessonEditScheduleResponseDto, {
      body: dataDto,
    }, { excludeExtraneousValues: true });
  }
}
