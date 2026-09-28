import { Injectable } from '@nestjs/common';
import {
  StudentLessonDto,
  StudentPrivateLessonsDataDto,
  StudentPrivateLessonsGroupedByDueDateDto,
  StudentGroupLessonsDataDto,
} from '../../dto/student-lessons-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { getStatus } from '../../../lesson/enums/lesson-status';

@Injectable()
export class StudentPrivateLessonsTransformationService {
  /**
   * Transform lessons data to response DTO grouped by dueDate
   */
  transformPrivateLessonsData(lessons: any[]): StudentPrivateLessonsDataDto {
    // Group lessons by dueDate
    const groupedLessons = this.groupLessonsByDueDate(lessons);

    return {
      body: groupedLessons,
    };
  }

  /**
   * Group lessons by dueDate
   */
  private groupLessonsByDueDate(lessons: any[]): StudentPrivateLessonsGroupedByDueDateDto[] {
    const groupedMap = new Map<string, StudentLessonDto[]>();

    for (const lesson of lessons) {
      const dueDate = formatDate(lesson?.dueDate);

      if (!groupedMap.has(dueDate)) {
        groupedMap.set(dueDate, []);
      }

      groupedMap.get(dueDate)!.push(this.transformPrivateLessonToDto(lesson));
    }

    // Convert map to array
    const result: StudentPrivateLessonsGroupedByDueDateDto[] = [];
    for (const [dueDate, lessonsGroup] of groupedMap) {
      result.push({
        dueDate,
        lessons: lessonsGroup,
      });
    }

    return result;
  }

  /**
   * Transform group lessons data to response DTO grouped by dueDate with pagination
   */
  transformGroupLessonsData(
    lessons: any[],
    total: number,
    page: number,
    limit: number,
  ): StudentGroupLessonsDataDto {
    const groupedLessons = this.groupGroupLessonsByDueDate(lessons);

    return {
      body: groupedLessons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Group group lessons by dueDate (raw query results)
   */
  private groupGroupLessonsByDueDate(lessons: any[]): StudentPrivateLessonsGroupedByDueDateDto[] {
    const groupedMap = new Map<string, StudentLessonDto[]>();

    for (const lesson of lessons) {
      const dueDate = formatDate(lesson?.dueDate);

      if (!groupedMap.has(dueDate)) {
        groupedMap.set(dueDate, []);
      }

      groupedMap.get(dueDate)!.push(this.transformGroupLessonToDto(lesson));
    }

    const result: StudentPrivateLessonsGroupedByDueDateDto[] = [];
    for (const [dueDate, lessonsGroup] of groupedMap) {
      result.push({
        dueDate,
        lessons: lessonsGroup,
      });
    }

    return result;
  }

  /**
   * Transform a single lesson with private lesson to DTO
   */
  private transformPrivateLessonToDto(lesson: any): StudentLessonDto {
    const privateLesson = lesson.privateLesson?.[0];
    const program = lesson?.course?.program;

    const programName = program?.name || '';
    const date = formatDateWithTime(new Date(lesson.date));
    const duration = formatDuration(lesson.duration);
    const status = getStatus(lesson) || '';
    const isOnline = lesson.isOnline === 1 ? 'Yes' : 'No';
    const price = formatCurrency(privateLesson?.total || '0');
    const owing = formatCurrency(privateLesson?.balance || '0');

    return {
      id: lesson.id,
      courseId: lesson.courseId ?? lesson.course?.id,
      programId: program?.id,
      teacherId: lesson.teacherId ?? lesson.teacher?.id,
      programName,
      date,
      duration,
      status,
      price,
      owing,
      isOnline,
      url: `lesson/${lesson.id}`,
    };
  }

  /**
   * Transform a single group lesson to DTO (raw query result)
   */
  private transformGroupLessonToDto(lesson: any): StudentLessonDto {
    const date = formatDateWithTime(new Date(lesson.lesson_date));
    const status = getStatus({
      status: lesson.lesson_status,
      isPresent: lesson.lesson_isPresent,
      isExploded: lesson.lesson_isExploded,
      privateLesson: lesson.privateLesson ?? [],
      date: lesson.lesson_date,
    }) || '';
    const price = formatCurrency(lesson?.total || '0');
    const owing = formatCurrency(lesson?.balance || '0');
    const duration = formatDuration(lesson.lesson_duration);
    const isOnline = lesson.isOnline ===1 ? 'Yes' : 'No';

    return {
      id: lesson.lesson_id,
      programName: lesson.programName || '',
      date: date,
      duration: duration,
      status: status,
      price,
      owing,
      isOnline: isOnline,
      url: `lesson/${lesson.lesson_id}`,
    };
  }
}
