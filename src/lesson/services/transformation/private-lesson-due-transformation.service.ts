import { Injectable } from '@nestjs/common';
import { IPrivateLessonDueTransformationService } from '../../interfaces/private-lesson-due-service.interface';
import { PrivateLessonDueDto } from '../../dto/private-lesson-due-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { publicProgramName } from '../../../pricing/utils/program-public-name';

@Injectable()
export class PrivateLessonDueTransformationService implements IPrivateLessonDueTransformationService {
  transformToDto(lesson: any, locationSlug: string): PrivateLessonDueDto {
    const id = lesson.id || 0;
    const lessonDate = lesson.date ? formatDate(lesson.date) : '';
    const studentName = `${lesson.course.enrolments[0].student.firstName} ${lesson.course.enrolments[0].student.lastName}`.trim() || '';
    const programName =
      publicProgramName(lesson.course?.program, lesson.course?.locationId) || '';
    
    const teacherName =`${lesson.teacher.profile.firstname} ${lesson.teacher.profile.lastname}`.trim() || '';
    const amount =  lesson.privateLesson?.[0]?.balance ? `$${parseFloat(lesson.privateLesson[0].balance).toFixed(2)}` : '$0.00';

    return {
      id,
      lessonDate,
      studentName,
      programName,
      teacherName,
      amount,
      url: `admin/${locationSlug}/private-lessons/${lesson.id}`,
    };
  }

  transformLessonsToDtos(lessons: any[], locationSlug: string): PrivateLessonDueDto[] {
    return lessons.map(lesson => this.transformToDto(lesson, locationSlug));
  }
}
