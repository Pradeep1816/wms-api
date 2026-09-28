import { Injectable } from '@nestjs/common';
import { GroupEnrolmentPrintData } from '../../repositories/group-enrolment-print.repository';
import { GroupEnrolmentPrintDetailDto, ScheduleLessonDto } from '../../dto/group-enrolment-print-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatDuration, formatTime } from '../../../utils/formatters';
import { publicProgramName } from '../../../pricing/utils/program-public-name';

@Injectable()
export class GroupEnrolmentPrintTransformationService {
  transform(data: GroupEnrolmentPrintData): GroupEnrolmentPrintDetailDto | null {
    const { enrolment, lessons, recentCourseSchedule, enrolmentCourseSchedule } = data;

    if (!enrolment) {
      return null;
    }

    const studentName = this.formatStudentName(enrolment.student);
    const programName =
      publicProgramName(
        enrolment.course?.program,
        enrolment.course?.locationId,
      ) || '';
    const teacherName = this.getTeacherName(recentCourseSchedule, enrolment);

    const time = enrolmentCourseSchedule?.fromTime
      ? formatTime(enrolmentCourseSchedule.fromTime) || ''
      : '';

    const duration = enrolmentCourseSchedule?.duration
      ? formatDuration(enrolmentCourseSchedule.duration)
      : '00:00';

    const startDate = enrolment.course?.startDate
      ? formatDate(enrolment.course.startDate)
      : '';

    const endDate = enrolment.endDateTime
      ? formatDate(enrolment.endDateTime)
      : '';

    const schedule = this.transformLessonsToSchedule(lessons);

    return {
      enrolmentId: enrolment.id,
      studentName,
      programName,
      teacherName,
      time,
      duration,
      startDate,
      endDate,
      schedule,
    };
  }

  private formatStudentName(student: any): string {
    if (!student) return '';
    const firstName = student.firstName || '';
    const lastName = student.lastName || '';
    return `${firstName} ${lastName}`.trim();
  }

  private getTeacherName(recentCourseSchedule: any, enrolment: any): string {
    if (recentCourseSchedule?.teacher?.profile) {
      const profile = recentCourseSchedule.teacher.profile;
      const firstName = profile.firstname || '';
      const lastName = profile.lastname || '';
      return `${firstName} ${lastName}`.trim();
    }

    if (enrolment.course?.teacher?.profile) {
      const profile = enrolment.course.teacher.profile;
      const firstName = profile.firstname || '';
      const lastName = profile.lastname || '';
      return `${firstName} ${lastName}`.trim();
    }

    return '';
  }

  private transformLessonsToSchedule(lessons: any[]): ScheduleLessonDto[] {
    return lessons.map(lesson => ({
      date: formatDateWithTime(lesson.date),
    }));
  }
}
