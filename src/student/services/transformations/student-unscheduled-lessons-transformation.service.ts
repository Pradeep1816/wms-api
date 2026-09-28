import { Injectable } from '@nestjs/common';
import {
  StudentUnscheduledLessonDto,
  StudentUnscheduledLessonsDataDto,
} from '../../dto/student-unscheduled-lessons-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatDuration, formatPhoneNumber } from '../../../utils/formatters';
import { Lesson } from '../../../lesson/entities/lesson.entity';

@Injectable()
export class StudentUnscheduledLessonsTransformationService {
  /**
   * Transform unscheduled lessons data to response DTO with pagination
   */
  transformUnscheduledLessonsData(
    lessons: Lesson[],
    total: number,
    page: number,
    limit: number,
  ): StudentUnscheduledLessonsDataDto {
    return {
      body: lessons.map(lesson => this.transformUnscheduledLessonToDto(lesson)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Transform a single unscheduled lesson to DTO
   */
  private transformUnscheduledLessonToDto(lesson: Lesson): StudentUnscheduledLessonDto {
    const program = lesson.course?.program;
    const privateLesson = lesson.privateLesson?.[0];
    const enrolment = lesson.course?.enrolments?.[0];
    const student = enrolment?.student;
    const customerUser = student?.user;

    return {
      id: lesson.id,
      program: program?.name || '',
      phone: this.getPrimaryPhone(customerUser),
      duration: formatDuration(lesson.duration),
      originalDate: this.getOriginalDate(lesson),
      expiryDate: privateLesson?.expiryDate ? formatDate(new Date(privateLesson.expiryDate)) : '',
      online: lesson.isOnline ? 'Yes' : 'No',
      url: `lesson/${lesson.id}`,
    };
  }

  /**
   * Get original date implementing legacy logic:
   * 1. First priority: Find the LAST bulk-rescheduled ancestor (highest id)
   * 2. Second priority: Fall back to root lesson's date (deepest ancestor)
   * 3. Final fallback: Use the lesson's own date
   */
  private getOriginalDate(lesson: Lesson): string {
    const hierarchy = lesson.lessonHierarchy || [];
    
    // Final fallback: no hierarchy, use lesson's own date
    if (hierarchy.length === 0) {
      return lesson.date ? formatDate(new Date(lesson.date)) : '';
    }

    // First priority: Find ancestors with bulk_reschedule_lesson records
    // Get the LAST one (highest id)
    const bulkRescheduledAncestors = hierarchy
      .filter(h => h.lesson?.bulkRescheduleLesson && h.lesson.bulkRescheduleLesson.length > 0)
      .sort((a, b) => (b.lesson?.id || 0) - (a.lesson?.id || 0));

    if (bulkRescheduledAncestors.length > 0) {
      const lastBulkRescheduled = bulkRescheduledAncestors[0];
      if (lastBulkRescheduled.lesson?.date) {
        return formatDate(new Date(lastBulkRescheduled.lesson.date));
      }
    }

    // Second priority: Fall back to root lesson's date (deepest ancestor by depth)
    const sortedByDepth = [...hierarchy].sort((a, b) => (b.depth || 0) - (a.depth || 0));
    const rootLesson = sortedByDepth[0]?.lesson;
    
    if (rootLesson?.date) {
      return formatDate(new Date(rootLesson.date));
    }

    // Final fallback: lesson's own date
    return lesson.date ? formatDate(new Date(lesson.date)) : '';
  }

  /**
   * Get primary phone number from customer's contacts
   * Falls back to first available phone if no primary contact exists
   */
  private getPrimaryPhone(user: any): string {
    if (!user?.contacts || !Array.isArray(user.contacts) || user.contacts.length === 0) {
      return '';
    }

    // Sort contacts by id to ensure consistent ordering
    const sortedContacts = [...user.contacts].sort((a, b) => (a.id || 0) - (b.id || 0));

    // Find primary contact (handles both boolean and number formats)
    const primaryContact = sortedContacts.find(
      (contact: any) => contact.isPrimary === true || contact.isPrimary === 1 || Number(contact.isPrimary) === 1
    );

    // Try to get phone from primary contact first
    if (primaryContact?.phones && Array.isArray(primaryContact.phones) && primaryContact.phones.length > 0) {
      // Sort phones by id for consistent ordering
      const sortedPhones = [...primaryContact.phones].sort((a, b) => (a.id || 0) - (b.id || 0));
      const phone = sortedPhones[0];
      if (phone?.number) {
        return formatPhoneNumber(phone.number);
      }
    }

    // Fallback: get first phone from any contact (sorted by contact id, then phone id)
    for (const contact of sortedContacts) {
      if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) {
        const sortedPhones = [...contact.phones].sort((a, b) => (a.id || 0) - (b.id || 0));
        const phone = sortedPhones[0];
        if (phone?.number) {
          return formatPhoneNumber(phone.number);
        }
      }
    }

    return '';
  }
}
