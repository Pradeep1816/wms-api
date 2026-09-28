import { Injectable } from '@nestjs/common';
import { GroupLessonDueDto } from '../../dto/group-lesson-due-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import type { IGroupLessonDueTransformationService } from '../../interfaces/group-lesson-due-service.interface';
import { publicProgramName } from '../../../pricing/utils/program-public-name';

@Injectable()
export class GroupLessonDueTransformationService implements IGroupLessonDueTransformationService {
  /**
   * Transform group lesson due to DTO
   */
  transformToDto(groupLesson: any, locationSlug: string): GroupLessonDueDto {
    const lesson = groupLesson?.lesson;
    const student = groupLesson?.enrolment?.student;
    const program = lesson?.course?.program;
    const teacher = lesson?.teacher;

    // Get student name
    const studentName = 
      `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    
    // Get program name
    const programName =
      publicProgramName(program, lesson?.course?.locationId) || '';
    
    // Get teacher name
    const teacherName = 
      `${teacher?.profile?.firstname || ''} ${teacher?.profile?.lastname || ''}`.trim();
    
    // Format lesson date
    const lessonDate = new Date(lesson?.date);
    const lessonDateFormatted = formatDate(lessonDate);

    // Get amount (use balance if > 0, otherwise use total)
    const balance = parseFloat(groupLesson?.balance?.toString() || '0');
    const total = parseFloat(groupLesson?.total?.toString() || '0');
    const amount = balance > 0 ? balance : total;
    
    // Format amount as currency (e.g., "$647.45")
    const formattedAmount = formatCurrency(amount);

    return {
      id: groupLesson.id,
      lessonDate: lessonDateFormatted,
      studentName: studentName,
      programName: programName,
      teacherName: teacherName,
      amount: formattedAmount,
      url: `admin/${locationSlug}/group-lessons/${groupLesson.lesson.id}`,
    };
  }

  /**
   * Transform multiple group lesson dues to DTOs
   */
  transformLessonsToDtos(lessons: any[], locationSlug: string): GroupLessonDueDto[] {
    return lessons.map(lesson => this.transformToDto(lesson, locationSlug));
  }
}
