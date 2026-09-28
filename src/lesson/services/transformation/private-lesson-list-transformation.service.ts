import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Lesson } from '../../entities/lesson.entity';
import {
  PrivateLessonListItemDto,
  PrivateLessonListDataDto,
} from '../../dto/private-lesson-list-response.dto';
import { formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { RoundingUtils } from 'src/utils/rounding.utils';
import { getStatus } from '../../enums/lesson-status';

@Injectable()
export class PrivateLessonListTransformationService {
  private static readonly BALANCE_TOLERANCE = RoundingUtils.BALANCE_TOLERANCE;

  /**
   * Transform a single lesson entity to DTO
   */
  transformToDto(
    lesson: Lesson,
    customerEmailByLessonId: Record<number, string | null> = {},
    customerEmailsByLessonId: Record<number, string | null> = {},
  ): PrivateLessonListItemDto {
    const enrolment = lesson.course?.enrolments?.[0];
    const studentData = enrolment?.student;
    const teacherData = lesson.teacher;
    const programData = lesson.course?.program;
    const privateLesson = lesson.privateLesson?.[0];
    const invoice = lesson.invoiceItemLessons?.find(
      (item) => item.invoiceLineItem?.invoice,
    )?.invoiceLineItem?.invoice;

    // Legacy payment status is invoice-aware first; if no invoice exists, fall back to private lesson balance.
    const balance = invoice
      ? Number(invoice.balance) || 0
      : Number(privateLesson?.balance) || 0;
    const payment =
      balance > PrivateLessonListTransformationService.BALANCE_TOLERANCE
        ? 'Owing'
        : 'Paid';

    // Format date using dayjs UTC to avoid timezone issues
    const formattedDate = lesson.date
      ? formatDateWithTime(new Date(lesson.date))
      : null;

    // Format duration as HH:mm (legacy uses H:i format)
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
      courseId: lesson.courseId ?? lesson.course?.id,
      date: formattedDate,
      student: studentName,
      program: programData?.name || null,
      teacher: teacherName,
      duration: durationFormatted,
      online: lesson.isOnline ? 'Yes' : 'No',
      status: getStatus(lesson),
      payment,
      price: formatCurrency(Number(privateLesson?.total) || 0),
      customerEmail: customerEmailByLessonId[lesson.id] ?? null,
      customerEmails: customerEmailsByLessonId[lesson.id] ?? null,
    };

    return plainToInstance(PrivateLessonListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple lesson entities to DTOs
   */
  transformLessonsToDtos(
    lessons: Lesson[],
    customerEmailByLessonId: Record<number, string | null> = {},
    customerEmailsByLessonId: Record<number, string | null> = {},
  ): PrivateLessonListItemDto[] {
    return lessons.map((lesson) =>
      this.transformToDto(
        lesson,
        customerEmailByLessonId,
        customerEmailsByLessonId,
      ),
    );
  }

  /**
   * Transform lessons data to PrivateLessonListDataDto
   */
  transformLessonsData(
    lessons: Lesson[],
    customerEmailByLessonId: Record<number, string | null>,
    customerEmailsByLessonId: Record<number, string | null>,
    total: number,
    page: number,
    limit: number,
  ): PrivateLessonListDataDto {
    const formattedLessons = this.transformLessonsToDtos(
      lessons,
      customerEmailByLessonId,
      customerEmailsByLessonId,
    );
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

    return plainToInstance(PrivateLessonListDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
