import { Injectable } from '@nestjs/common';
import {
  TeacherInvoicedLessonsResponseDto,
  TeacherInvoicedLessonDto,
  TeacherInvoicedLessonsSummaryDto,
} from '../../dto/teacher-invoiced-lessons-response.dto';
import { InvoiceLineItem } from '../../../invoice/entities/invoice-line-item.entity';
import { Program } from '../../../program/entities/program.entity';
import { publicProgramName } from '../../../pricing/utils/program-public-name';
import { formatCurrency, formatEasternTime } from 'src/utils/formatters';
const { formatLongDate } = require('../../../utils/date-utils');

@Injectable()
export class TeacherInvoicedLessonsTransformationService {
  transformToResponse(
    invoiceLineItems: InvoiceLineItem[],
    summaryOnly: boolean = false,
  ): TeacherInvoicedLessonsResponseDto {
    // Filter out items without lessons and map to response format
    // Store both formatted and numeric values for calculations
    const lessonsData = invoiceLineItems
      .filter((item) => item.invoiceItemLesson?.lesson)
      .map((item) => {
        // Access relations through the loaded data
        const invoice = item.invoice;
        const itemLesson = item.invoiceItemLesson;
        const lesson = itemLesson?.lesson || null;
        const course = lesson?.course || null;
        const program = course?.program || null;
        // Get enrolment from course.enrolments - for private lessons, there should be only one
        const enrolment = course?.enrolments?.[0] || null;
        const student = enrolment?.student || null;
        const isPrivate = program?.type === Program.TYPE_PRIVATE_PROGRAM;

        // Format invoice date like legacy: "Monday, November 24th, 2025"
        const invoiceDate = invoice?.date
          ? formatLongDate(new Date(invoice.date))
          : '';

        // Format lesson time
        const time = formatEasternTime(lesson?.date);

        // Get student name if private lesson
        const studentName = isPrivate && student
          ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || null
          : null;

        // Keep numeric values for calculations
        const numericRate = Number(item.rate || 0);
        const numericCost = Number(item.cost || 0);
        const numericDuration = item.unit || 0;

        return {
          lessonDto: {
            invoiceDate,
            time,
            // Instructor-facing document - see the note in the Time Voucher
            // transformation.
            program: publicProgramName(program, course?.locationId),
            student: isPrivate ? studentName : '-',
            duration: numericDuration,
            rate: formatCurrency(numericRate),
            cost: formatCurrency(numericCost),
          },
          lessonId: lesson?.id || 0, // Track lesson ID for deduplication
          numericCost,
          numericDuration,
          invoiceDateValue: invoice?.date ? new Date(invoice.date).getTime() : 0,
        };
      });

    // Extract formatted lessons for response
    const lessons: TeacherInvoicedLessonDto[] = lessonsData.map(data => data.lessonDto);

    // Group lessons by invoiceDate
    // Track unique lesson IDs per date to avoid double-counting and duplicate rows for group lessons
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
      
      // Only add lesson row once per unique lesson ID (important for group lessons)
      // Legacy shows only one row per unique lesson, not one per invoice line item
      if (!seenLessonIds.has(data.lessonId)) {
        // Remove invoiceDate from lesson DTO since it's already in the parent group
        const { invoiceDate, ...lessonWithoutDate } = data.lessonDto;
        acc[dateKey].lessons.push(lessonWithoutDate);
        acc[dateKey].dateTotalCost += data.numericCost;
        acc[dateKey].dateTotalDuration += data.numericDuration;
        seenLessonIds.add(data.lessonId);
      }
      
      return acc;
    }, {} as Record<string, { invoiceDate: string; lessons: Omit<TeacherInvoicedLessonDto, 'invoiceDate'>[]; dateTotalCost: number; dateTotalDuration: number }>);

    // Convert to array, sort lessons by time within each group, and format totals
    const groupedArray = Object.values(groupedByDate).map((group) => {
      // Sort lessons by time within this date group
      const sortedLessons = [...group.lessons].sort((a, b) => {
        // Extract time from "HH:MM AM/PM" format for comparison
        const parseTime = (timeStr: string | null): number => {
          if (!timeStr) return 0;
          const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          return hours * 60 + minutes; // Convert to minutes for comparison
        };
        
        return parseTime(a.time) - parseTime(b.time);
      });

      return {
        invoiceDate: group.invoiceDate,
        // Don't include invoiceDate in lesson objects since it's already in the parent group
        lessons: sortedLessons,
        totalCost: formatCurrency(Number(group.dateTotalCost.toFixed(2))),
        totalDuration: Number(group.dateTotalDuration.toFixed(2)),
      };
    });

    // Calculate grand totals using numeric values
    // Both cost and duration: only count each unique lesson ID once (important for group lessons)
    // Legacy counts each lesson once, not per invoice line item
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

    // If summaryOnly is true, return simplified format
    if (summaryOnly) {
      // Create a map to track invoice date values for sorting
      const invoiceDateMap = new Map<string, number>();
      lessonsData.forEach(data => {
        if (!invoiceDateMap.has(data.lessonDto.invoiceDate)) {
          invoiceDateMap.set(data.lessonDto.invoiceDate, data.invoiceDateValue);
        }
      });

      // Sort grouped array by invoice date, then map to summary format
      const summary: TeacherInvoicedLessonsSummaryDto[] = groupedArray
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

      // Add total row with empty date at the end
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

