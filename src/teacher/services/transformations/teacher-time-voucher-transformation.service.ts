import { Injectable } from '@nestjs/common';
import {
  TeacherTimeVoucherResponseDto,
  TeacherTimeVoucherLessonDto,
  TeacherTimeVoucherGroupedByDateDto,
  TeacherTimeVoucherSummaryDto,
} from '../../dto/teacher-time-voucher-response.dto';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { Program } from '../../../program/entities/program.entity';
import { publicProgramName } from '../../../pricing/utils/program-public-name';
import { formatEasternTime, parseDurationToHours } from '../../../utils/formatters';
const { formatLongDateUTC } = require('../../../utils/date-utils');

@Injectable()
export class TeacherTimeVoucherTransformationService {

  private getUTCDateValue(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
 
  /** Shared fields for a lesson row (used by both private and group builders) */
  private buildSharedLessonFields(
    lesson: Lesson,
    program: { name: string; publicName?: string | null } | null,
  ): {
    lessonId: number;
    time: string | null;
    programName: string | null;
    durationInHours: number;
    lessonDate: string;
    lessonDateValue: number;
  } {
    const lessonDate = lesson?.date
      ? formatLongDateUTC(new Date(lesson.date))
      : '';
    const lessonDateValue = lesson?.date
      ? this.getUTCDateValue(new Date(lesson.date))
      : 0;
    const time = formatEasternTime(lesson?.date);
    const durationInHours = parseDurationToHours(lesson?.duration);
    return {
      lessonId: lesson?.id || 0,
      time,
      // Instructor-facing document: never show an internal marker such as the
      // `x` prefix on old-pricing programs or the `_` prefix on an interim
      // September program.
      programName: publicProgramName(program, lesson?.course?.locationId),
      durationInHours,
      lessonDate,
      lessonDateValue,
    };
  }

  /** One row per unique student for private lessons; one row with null student if no enrolments */
  private buildRowsForPrivateLesson(
    enrolments: Array<{ student?: { id?: number; firstName?: string; lastName?: string } | null; studentId?: number }>,
    shared: ReturnType<TeacherTimeVoucherTransformationService['buildSharedLessonFields']>,
  ): Array<{ lessonDto: TeacherTimeVoucherLessonDto; lessonDate: string; lessonDateValue: number; durationInHours: number }> {
    const rows: Array<{ lessonDto: TeacherTimeVoucherLessonDto; lessonDate: string; lessonDateValue: number; durationInHours: number }> = [];
    if (enrolments.length === 0) {
      rows.push({
        lessonDto: {
          id: shared.lessonId,
          time: shared.time,
          program: shared.programName,
          student: null,
          duration: shared.durationInHours,
        },
        lessonDate: shared.lessonDate,
        lessonDateValue: shared.lessonDateValue,
        durationInHours: shared.durationInHours,
      });
      return rows;
    }
    const seenStudentIds = new Set<number>();
    for (const enrolment of enrolments) {
      const student = enrolment?.student ?? null;
      const studentId = student?.id ?? enrolment?.studentId;
      if (studentId !== undefined && seenStudentIds.has(studentId)) continue;
      if (studentId !== undefined) seenStudentIds.add(studentId);
      const studentName = student
        ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || null
        : null;
      rows.push({
        lessonDto: {
          id: shared.lessonId,
          time: shared.time,
          program: shared.programName,
          student: studentName,
          duration: shared.durationInHours,
        },
        lessonDate: shared.lessonDate,
        lessonDateValue: shared.lessonDateValue,
        durationInHours: shared.durationInHours,
      });
    }
    return rows;
  }

  /** Single row with student "-" for group lessons */
  private buildRowsForGroupLesson(
    shared: ReturnType<TeacherTimeVoucherTransformationService['buildSharedLessonFields']>,
  ): Array<{ lessonDto: TeacherTimeVoucherLessonDto; lessonDate: string; lessonDateValue: number; durationInHours: number }> {
    return [{
      lessonDto: {
        id: shared.lessonId,
        time: shared.time,
        program: shared.programName,
        student: '-',
        duration: shared.durationInHours,
      },
      lessonDate: shared.lessonDate,
      lessonDateValue: shared.lessonDateValue,
      durationInHours: shared.durationInHours,
    }];
  }

  private deduplicateLessonsAndMergeEnrolments(lessons: Lesson[]): Lesson[] {
    const lessonMap = new Map<number, Lesson>();
    for (const lesson of lessons) {
      const existing = lessonMap.get(lesson.id);
      if (existing?.course) {
        const existingEnrolments = existing.course.enrolments || [];
        const newEnrolments = lesson.course?.enrolments || [];
        const enrolmentIds = new Set(existingEnrolments.map((e) => e.id));
        for (const enr of newEnrolments) {
          if (!enrolmentIds.has(enr.id)) {
            existingEnrolments.push(enr);
            enrolmentIds.add(enr.id);
          }
        }
      } else {
        lessonMap.set(lesson.id, lesson);
      }
    }
    return Array.from(lessonMap.values());
  }

  transformToResponse(
    lessons: Lesson[],
    summaryOnly: boolean = false,
  ): TeacherTimeVoucherResponseDto {
    const lessonsData: Array<{
      lessonDto: TeacherTimeVoucherLessonDto;
      lessonDate: string;
      lessonDateValue: number;
      durationInHours: number;
    }> = [];

    // Deduplicate lessons and merge enrolments
    const uniqueLessons = this.deduplicateLessonsAndMergeEnrolments(lessons);

    uniqueLessons.forEach((lesson) => {
      const course = lesson?.course ?? null;
      const program = course?.program ?? null;
      const enrolments = course?.enrolments ?? [];
      const isPrivate = program?.type === Program.TYPE_PRIVATE_PROGRAM;

      const sharedLessonFields = this.buildSharedLessonFields(lesson, program);
      const rows = isPrivate
        ? this.buildRowsForPrivateLesson(enrolments, sharedLessonFields)
        : this.buildRowsForGroupLesson(sharedLessonFields);
      rows.forEach((row) => lessonsData.push(row));
    });

    // Group lessons by date
    // Track unique lesson IDs per date to avoid double-counting duration for group lessons
    const seenLessonIdsByDate = new Map<string, Set<number>>();
    
    const groupedByDate = lessonsData.reduce((acc, data) => {
      const dateKey = data.lessonDate;
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          lessons: [],
          dateTotalDuration: 0,
          lessonDateValue: data.lessonDateValue,
        };
        seenLessonIdsByDate.set(dateKey, new Set());
      }
      
      acc[dateKey].lessons.push(data.lessonDto);
      
      // Only count duration once per unique lesson ID (important for group lessons)
      const seenLessonIds = seenLessonIdsByDate.get(dateKey)!;
      if (!seenLessonIds.has(data.lessonDto.id)) {
        acc[dateKey].dateTotalDuration += data.durationInHours;
        seenLessonIds.add(data.lessonDto.id);
      }
      
      return acc;
    }, {} as Record<string, { date: string; lessons: TeacherTimeVoucherLessonDto[]; dateTotalDuration: number; lessonDateValue: number }>);

    // Convert to array, sort lessons by time within each group, then sort groups by date
    const groupedData: TeacherTimeVoucherGroupedByDateDto[] = Object.values(groupedByDate)
      .map((group) => {
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
          date: group.date,
          lessons: sortedLessons,
          totalDuration: Number(group.dateTotalDuration.toFixed(2)),
        };
      })
      .sort((a, b) => {
        const aDate = groupedByDate[a.date]?.lessonDateValue || 0;
        const bDate = groupedByDate[b.date]?.lessonDateValue || 0;
        return aDate - bDate;
      });

    // Calculate total duration across all dates
    // Only count each unique lesson ID once (important for group lessons)
    const seenLessonIds = new Set<number>();
    const totalDuration = lessonsData.reduce((sum, data) => {
      if (!seenLessonIds.has(data.lessonDto.id)) {
        seenLessonIds.add(data.lessonDto.id);
        return sum + data.durationInHours;
      }
      return sum;
    }, 0);

    // If summaryOnly is true, return simplified format
    if (summaryOnly) {
      // Create summary format with date and duration only
      const summary: TeacherTimeVoucherSummaryDto[] = groupedData.map((group) => ({
        date: group.date,
        duration: group.totalDuration,
      }));

      return {
        body: summary,
        footer: {
          totalDuration: Number(totalDuration.toFixed(2)),
        },
      };
    }

    return {
      body: groupedData,
      footer: {
        totalDuration: Number(totalDuration.toFixed(2)),
      },
    };
  }
}
