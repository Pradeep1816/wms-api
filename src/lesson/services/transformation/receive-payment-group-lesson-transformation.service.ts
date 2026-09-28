import { Injectable } from '@nestjs/common';
import { ReceivePaymentGroupLessonResponseDto } from '../../dto/receive-payment-group-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ReceivePaymentGroupLessonTransformationService {
    transformToDto(lesson: any): ReceivePaymentGroupLessonResponseDto {
        const id = lesson.id;
        const lessonDate = lesson.lesson?.date ? formatDateWithTime(lesson.lesson.date) : '';
        const dueDate = lesson.dueDate ? formatDate(lesson.dueDate) : '';
        const studentName = `${lesson.enrolment?.student?.firstName || ''} ${lesson.enrolment?.student?.lastName || ''}`.trim() || '';
        const programName = lesson.lesson?.course?.program?.name || '';
        const teacherName = `${lesson.lesson?.teacher?.profile?.firstname || ''} ${lesson.lesson?.teacher?.profile?.lastname || ''}`.trim() || '';
        
        const balance = Number(lesson.balance || 0);
        const total = Number(lesson.total || 0);
        
        const dtoData = {
          id,
          date: lessonDate,
          dueDate,
          studentName,
          programName,
          teacherName,
          total,
          balance,
          payments:balance,
        };

        return plainToInstance(ReceivePaymentGroupLessonResponseDto, dtoData);
    }

    transformLessonsToDtos(lessons: any[], paymentMap: any = {}): ReceivePaymentGroupLessonResponseDto[] {
        return lessons.map(lesson => this.transformToDto(lesson));
    }
}
