import { Injectable } from '@nestjs/common';
import {
  TeacherUnscheduledLessonDto,
} from '../../dto/teacher-unscheduled-lessons-response.dto';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { formatDuration, formatPhoneNumber } from '../../../utils/formatters';
import { formatDate } from '../../../utils/date-utils';

@Injectable()
export class TeacherUnscheduledLessonsTransformationService {
  transformToResponse(
    lessons: Lesson[],
  ): TeacherUnscheduledLessonDto[] {
    console.log('lessons', lessons);
    const lessonsData: TeacherUnscheduledLessonDto[] = lessons.map((lesson) => {
      const course = lesson.course || null;
      const program = course?.program || null;
      // Get enrolment from course.enrolments - for private lessons, there should be only one
      const enrolment = course?.enrolments?.[0] || null;
      const student = enrolment?.student || null;
      const user = student?.user || null;

      // Get student name
      const studentName = student
        ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || ''
        : '';

      // Get phone number from primary contact
      const phone = this.getPrimaryPhone(user);

      // Get program name
      const programName = program?.name || '';
      const programId = program?.id;

      // Format duration as "00:30"
      const duration = formatDuration(lesson.duration);

      // Format original date as "Sep 19, 2025"
      const originalDate = lesson.date
        ? formatDate(lesson.date)
        : '';

      // Get expiry date from privateLesson
      const privateLesson = lesson.privateLesson?.[0] || null;
      const expiryDate = privateLesson?.expiryDate
        ? formatDate(privateLesson.expiryDate)
        : '';

      const teacherUser = lesson.teacher || null;
      const teacherProfile = (teacherUser as any)?.profile || null;
      const teacherFirst = teacherProfile?.firstname || '';
      const teacherLast = teacherProfile?.lastname || '';
      const teacherName = `${teacherFirst} ${teacherLast}`.trim();

      return {
        id: lesson.id,
        student: studentName,
        phone: phone,
        program: programName,
        programId: programId,
        duration: duration,
        originalDate: originalDate,
        expiryDate: expiryDate,
        teacher: teacherUser
          ? {
              id: teacherUser.id,
              title: teacherName,
            }
          : undefined,
      };
    });

    return lessonsData;
  }

  /**
   * Get primary phone number from user contacts
   * Falls back to first available phone if no primary contact exists
   */
  private getPrimaryPhone(user: any): string {
    if (!user || !user.contacts || !Array.isArray(user.contacts) || user.contacts.length === 0) {
      return '';
    }

    // Find primary contact (handles both boolean and number formats)
    const primaryContact = user.contacts.find(
      (contact: any) => contact.isPrimary === true || contact.isPrimary === 1 || Number(contact.isPrimary) === 1
    );

    // Try to get phone from primary contact first
    if (primaryContact && primaryContact.phones && Array.isArray(primaryContact.phones) && primaryContact.phones.length > 0) {
      const phone = primaryContact.phones[0];
      if (phone && phone.number) {
        return formatPhoneNumber(phone.number);
      }
    }

    // Fallback: get first phone from any contact
    for (const contact of user.contacts) {
      if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) {
        const phone = contact.phones[0];
        if (phone && phone.number) {
          return formatPhoneNumber(phone.number);
        }
      }
    }

    return '';
  }

}
