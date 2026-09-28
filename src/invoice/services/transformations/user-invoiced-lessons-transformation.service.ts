import { Injectable } from '@nestjs/common';
import {
  UserInvoicedLessonsResponseDto,
  UserInvoicedLessonDto,
  UserInvoicedLessonsSummaryDto,
} from '../../dto/user-invoiced-lessons-response.dto';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { Program } from '../../../program/entities/program.entity';
import { formatCurrency, formatEasternTime } from 'src/utils/formatters';
const { formatLongDate } = require('../../../utils/date-utils');

@Injectable()
export class UserInvoicedLessonsTransformationService {
  transformToResponse(
    invoiceLineItems: InvoiceLineItem[],
    summaryOnly: boolean = false,
  ): UserInvoicedLessonsResponseDto {
    const lessonsData = invoiceLineItems
      .filter((item) => item.invoiceItemLesson?.lesson)
      .map((item) => {
        const invoice = item.invoice;
        const itemLesson = item.invoiceItemLesson;
        const lesson = itemLesson?.lesson || null;
        const course = lesson?.course || null;
        const program = course?.program || null;
        // Prefer the enrolment tied directly to the invoice line item (legacy-style linkage).
        const enrolment =
          item.invoiceItemEnrolment?.enrolment || course?.enrolments?.[0] || null;
        const student = enrolment?.student || null;
        const isPrivate = program?.type === Program.TYPE_PRIVATE_PROGRAM;

        const invoiceDate = invoice?.date
          ? formatLongDate(new Date(invoice.date))
          : '';

        const time = formatEasternTime(lesson?.date);

        const studentName = isPrivate && student
          ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || null
          : null;

        const numericRate = Number(item.rate || 0);
        const numericCost = Number(item.cost || 0);
        const numericDuration = item.unit || 0;

        return {
          lessonDto: {
            id: lesson?.id || 0,
            invoiceDate,
            time,
            program: program?.name || null,
            student: isPrivate ? studentName : '-',
            duration: numericDuration,
            rate: formatCurrency(numericRate),
            cost: formatCurrency(numericCost),
          },
          lessonId: lesson?.id || 0,
          numericCost,
          numericDuration,
          invoiceDateValue: invoice?.date ? new Date(invoice.date).getTime() : 0,
        };
      });

    const lessons: UserInvoicedLessonDto[] = lessonsData.map(data => data.lessonDto);

    const seenLessonIdsByDate = new Map<string, Set<number>>();
    
    const groupedByDate = lessonsData.reduce((acc, data) => {
      const dateKey = data.lessonDto.invoiceDate;
      if (!acc[dateKey]) {
        acc[dateKey] = {
          invoiceDate: dateKey,
          lessons: [],
          dateTotalCost: 0,
          dateTotalDuration: 0,
        };
        seenLessonIdsByDate.set(dateKey, new Set());
      }
      
      const seenLessonIds = seenLessonIdsByDate.get(dateKey)!;
      
      if (!seenLessonIds.has(data.lessonId)) {
        const { invoiceDate, ...lessonWithoutDate } = data.lessonDto;
        acc[dateKey].lessons.push(lessonWithoutDate);
        acc[dateKey].dateTotalCost += data.numericCost;
        acc[dateKey].dateTotalDuration += data.numericDuration;
        seenLessonIds.add(data.lessonId);
      }
      
      return acc;
    }, {} as Record<string, { invoiceDate: string; lessons: Omit<UserInvoicedLessonDto, 'invoiceDate'>[]; dateTotalCost: number; dateTotalDuration: number }>);

    const groupedArray = Object.values(groupedByDate).map((group) => {
      const sortedLessons = [...group.lessons].sort((a, b) => {
        const parseTime = (timeStr: string | null): number => {
          if (!timeStr) return 0;
          const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          return hours * 60 + minutes;
        };
        
        return parseTime(a.time) - parseTime(b.time);
      });

      return {
        invoiceDate: group.invoiceDate,
        lessons: sortedLessons,
        totalCost: formatCurrency(Number(group.dateTotalCost.toFixed(2))),
        totalDuration: Number(group.dateTotalDuration.toFixed(2)),
      };
    });

    const seenLessonIds = new Set<number>();
    let totalCost = 0;
    let totalDuration = 0;
    
    lessonsData.forEach((data) => {
      if (!seenLessonIds.has(data.lessonId)) {
        seenLessonIds.add(data.lessonId);
        totalCost += data.numericCost;
        totalDuration += data.numericDuration;
      }
    });

    if (summaryOnly) {
      const invoiceDateMap = new Map<string, number>();
      lessonsData.forEach(data => {
        if (!invoiceDateMap.has(data.lessonDto.invoiceDate)) {
          invoiceDateMap.set(data.lessonDto.invoiceDate, data.invoiceDateValue);
        }
      });

      const summary: UserInvoicedLessonsSummaryDto[] = groupedArray
        .sort((a, b) => {
          const aDate = invoiceDateMap.get(a.invoiceDate) || 0;
          const bDate = invoiceDateMap.get(b.invoiceDate) || 0;
          return aDate - bDate;
        })
        .map((group) => ({
          date: group.invoiceDate,
          duration: group.totalDuration,
          cost: group.totalCost,
        }));

      summary.push({
        date: '',
        duration: Number(totalDuration.toFixed(2)),
        cost: formatCurrency(Number(totalCost.toFixed(2))),
      });

      return {
        body: summary,
        totalCost: formatCurrency(Number(totalCost.toFixed(2))),
        totalDuration: Number(totalDuration.toFixed(2)),
      };
    }

    return {
      body: groupedArray,
      totalCost: formatCurrency(Number(totalCost.toFixed(2))),
      totalDuration: Number(totalDuration.toFixed(2)),
    };
  }
}
