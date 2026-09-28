import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { Program } from '../../../program/entities/program.entity';
import {
  LessonStatusEnum,
  getStatus as getLessonStatus,
} from '../../../lesson/enums/lesson-status';
import { DailyScheduleItemDto } from '../../dto/daily-schedule-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatEasternTime } from '../../../utils/formatters';
import { getDailyScheduleLessonClassName } from '../../../utils/helper';

@Injectable()
export class DailyScheduleTransformationService {
  transformLessonsToDailyScheduleDtos(
    lessons: Lesson[],
    rescheduledLeafDateMap: Map<number, Date>,
    colorMap: Map<string, string>,
    firstNonCanceledLessonIdMap: Map<number, number>,
  ): DailyScheduleItemDto[] {
    return lessons.map((lesson) =>
      this.transformLessonToDto(
        lesson,
        rescheduledLeafDateMap,
        colorMap,
        firstNonCanceledLessonIdMap,
      ),
    );
  }

  private transformLessonToDto(
    lesson: Lesson,
    rescheduledLeafDateMap: Map<number, Date>,
    colorMap: Map<string, string>,
    firstNonCanceledLessonIdMap: Map<number, number>,
  ): DailyScheduleItemDto {
    const program = lesson.course?.program;
    const student = this.getStudentDisplay(lesson, program?.type);
    const teacher = this.getTeacherDisplay(lesson);
    const classroom = lesson.classroom?.name || null;
    const status = this.getDailyScheduleStatus(
      lesson,
      rescheduledLeafDateMap.get(lesson.id),
    );
    const startTime = formatEasternTime(lesson.date) || '';
    const colorCode = this.getColorCode(
      lesson,
      program?.type,
      colorMap,
      firstNonCanceledLessonIdMap,
    );

    const dtoData: DailyScheduleItemDto = {
      lessonId: lesson.id,
      startTime,
      program: program?.name || '',
      student,
      teacher,
      classroom,
      status,
      colorCode,
    };

    return plainToInstance(DailyScheduleItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  private getStudentDisplay(lesson: Lesson, programType?: number): string {
    if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
      return '-';
    }

    const firstEnrolment = lesson.course?.enrolments?.find(
      (enrolment) => !enrolment.isDeleted && enrolment.student,
    );
    const firstName = firstEnrolment?.student?.firstName || '';
    const lastName = firstEnrolment?.student?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || '-';
  }

  private getTeacherDisplay(lesson: Lesson): string {
    const firstName = lesson.teacher?.profile?.firstname || '';
    const lastName = lesson.teacher?.profile?.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim();

    if (fullName) {
      return fullName;
    }

    return lesson.teacher?.username || '';
  }

  private getDailyScheduleStatus(
    lesson: Lesson,
    rescheduledLeafDate?: Date,
  ): string {
    if (
      lesson.status === Number(LessonStatusEnum.CANCELED) &&
      rescheduledLeafDate
    ) {
      return `Rescheduled to ${formatDate(rescheduledLeafDate)}`;
    }

    return getLessonStatus(lesson);
  }

  private getColorCode(
    lesson: Lesson,
    programType: number | undefined,
    colorMap: Map<string, string>,
    firstNonCanceledLessonIdMap: Map<number, number>,
  ): string | null {
    if (lesson.colorCode) {
      return lesson.colorCode;
    }

    const rootLesson = this.getRootLessonFromHierarchy(lesson);
    const className = getDailyScheduleLessonClassName(lesson, rootLesson, {
      programType,
      firstLessonIdByCourseId: firstNonCanceledLessonIdMap,
      extraLessonType: 2,
    });
    if (!className) {
      return null;
    }

    return colorMap.get(className.toLowerCase()) || null;
  }

  private getRootLessonFromHierarchy(lesson: Lesson): Lesson | null {
    const rootHierarchyEntry = lesson.lessonHierarchy
      ?.filter(
        (hierarchy) =>
          !!hierarchy?.lesson &&
          Number(hierarchy.lesson.id) !== Number(lesson.id),
      )
      .sort(
        (left, right) =>
          Number(left.lesson.id ?? 0) - Number(right.lesson.id ?? 0),
      )[0];

    return rootHierarchyEntry?.lesson || null;
  }
}
