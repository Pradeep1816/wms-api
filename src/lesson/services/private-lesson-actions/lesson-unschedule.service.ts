import { BadRequestException, Injectable } from '@nestjs/common';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { LessonUnscheduleRepository } from '../../repositories/private-lesson-actions/lesson-unschedule.repository';
import { GetReasonsToUnscheduleResponseDto,LessonUnscheduleDto } from '../../dto/private-lesson-action-dto/lesson-unschedule-request.dto';
import { Program } from '../../../program/entities/program.entity';

/**
 * Legacy-compatible bulk unschedule endpoint used by the lesson action menu.
 * The route stays under private-lesson for compatibility, but selected lesson ids
 * may belong to either private or group programs.
 */
@Injectable()
export class LessonUnscheduleService {
  constructor(
    private readonly unscheduleRepository: LessonUnscheduleRepository,
  ) { }

  /**
   * Legacy: unscheduled-lesson/reason-to-unschedule (GET)
   * Returns reasons for the "Reason To Unschedule" modal.
   */
  async getReasonsToUnschedule(): Promise<GetReasonsToUnscheduleResponseDto> {
    const reasons =
      await this.unscheduleRepository.findReasonsToUnschedule();
      const data = {
        reasons: reasons.map((r) => ({ id: r.id, reason: r.reason })),
        title: 'Reason To Unschedule',
      };
    return{title: data.title, reasons: data.reasons};
  }

  /**
   * Legacy: unscheduled-lesson/bulk-unschedule (POST)
   * Unschedule lessons: validate (not invoiced), create Note, update lesson status.
   */
  async unscheduleLessons(
    locationId: number,
    dto: LessonUnscheduleDto,
    createdByUserId: number,
  ): Promise<{ status: boolean; message: string }> {
    const lessons = await this.unscheduleRepository.getLessonsWithCourse(
      dto.lessonIds,
    );

    if (lessons.length !== dto.lessonIds.length) {
      throw new BadRequestException('One or more lessons not found.');
    }

    const lessonsInLocation = lessons.filter(
      (l) => l.course?.locationId === locationId,
    );
    if (lessonsInLocation.length !== dto.lessonIds.length) {
      throw new BadRequestException(
        'One or more lessons do not belong to this location.',
      );
    }

    for (const lesson of lessonsInLocation) {
      const programType = lesson.course?.program?.type;
      if (
        programType !== Program.TYPE_PRIVATE_PROGRAM &&
        programType !== Program.TYPE_GROUP_PROGRAM
      ) {
        throw new BadRequestException(
          'Only private and group lessons can be unscheduled.',
        );
      }

      const isInvoiced = await this.unscheduleRepository.lessonInvoiced(
        lesson.id,
        programType,
        lesson.courseId,
      );
      if (isInvoiced) {
        throw new BadRequestException(
          "One of the selected lessons is invoiced. Invoiced lessons can't be edited.",
        );
      }
    }

    for (const lesson of lessonsInLocation) {
      await this.unscheduleRepository.createAndSaveNote(
        dto.reason,
        lesson.id,
        createdByUserId,
      );

      lesson.status = LessonStatusEnum.UNSCHEDULED;
      lesson.isPresent = true;
      await this.unscheduleRepository.saveLesson(lesson);
    }

    return {
      status: true,
      message: 'Lessons unscheduled successfully',
    };
  }
}
