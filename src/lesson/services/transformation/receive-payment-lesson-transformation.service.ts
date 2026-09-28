import { Injectable } from '@nestjs/common';
import { ReceivePaymentLessonResponseDto } from '../../dto/receive-payment-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import { plainToInstance } from 'class-transformer';
@Injectable()
export class ReceivePaymentLessonTransformationService {
    transformToDto(lesson: any): ReceivePaymentLessonResponseDto {
        const id = lesson.id;
        const lessonDate = lesson.date ? formatDateWithTime(lesson.date) : '';
        const dueDate = lesson.dueDate ? formatDate(lesson.dueDate) : '';
        const studentName = `${lesson.course.enrolments[0].student.firstName} ${lesson.course.enrolments[0].student.lastName}`.trim() || '';
        const programName = lesson.course?.program?.name || '';
        const teacherName =`${lesson.teacher.profile.firstname} ${lesson.teacher.profile.lastname}`.trim() || '';
        const amount =  lesson.privateLesson?.[0]?.balance || 0;
        const total = lesson.privateLesson?.[0]?.total || 0;
        
        const dtoData = {
          id,
          date: lessonDate,
          dueDate,
          studentName,
          programName,
          teacherName,
          total,
          balance: amount,
          payments:amount,
        };

        return plainToInstance(ReceivePaymentLessonResponseDto, dtoData);
      }

  transformLessonsToDtos(lessons: any[], paymentMap: any = {}): ReceivePaymentLessonResponseDto[] {
    return lessons.map(lesson => this.transformToDto(lesson));
  }
}

