import { BadRequestException, Injectable } from '@nestjs/common';
import { EditClassroomRepository } from '../../repositories/private-lesson-actions/edit-classroom.repository';

@Injectable()
export class EditClassroomService {
  constructor(
    private readonly editClassroomRepository: EditClassroomRepository,
  ) {}

  //bulk edit classroom for given private lesson ids
  async editClassroomForLessons(
    locationId: number,
    lessonIds: number[],
    classroomId: number | null,
  ): Promise<any> {
    if (!lessonIds?.length) {
      throw new BadRequestException('At least one lessonId is required');
    }

    //validate on invoiced
    const invoicedLessonIds = await this.editClassroomRepository.getInvoicedLessonIds(
      lessonIds,
    );

    if (invoicedLessonIds.length > 0) {
      throw new BadRequestException(
        "One of the selected lessons is invoiced. Invoiced lessons can't be edited.",
      );
    }

    //load lessons for overlap / unavailability checks (same as legacy: always run for set or null classroom)
    const lessons = await this.editClassroomRepository.getLessonsByIds(lessonIds, locationId);
    if (lessons.length !== lessonIds.length) {
      throw new BadRequestException('One or more lessons not found for this location.');
    }

    //collect unique dates and precompute time ranges
    const dateSet = new Set<string>();
    const lessonTimeRanges: {
      lessonId: number;
      lessonDateStr: string;
      startTime: string;
      endTime: string;
    }[] = [];

    for (const lesson of lessons) {
      const d = lesson.date instanceof Date ? lesson.date : new Date(lesson.date);
      const lessonDateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      dateSet.add(lessonDateStr);

      //use TIME(lesson.date) directly (no UTC conversion)
      const startTime = d.toTimeString().split(' ')[0]; // HH:MM:SS

      //use only hours + minutes
      const parts = (lesson.duration || '00:00:00').split(':').map(Number);
      const h = parts[0] ?? 0;
      const m = parts[1] ?? 0;
      const end = new Date(d.getTime() + h * 3600000 + m * 60000 - 1000);
      const endTime = end.toTimeString().split(' ')[0]; // HH:MM:SS

      lessonTimeRanges.push({
        lessonId: lesson.id,
        lessonDateStr,
        startTime,
        endTime,
      });
    }

    //batched unavailability 
    const lessonDates = Array.from(dateSet);
    const unavailableDates =
      await this.editClassroomRepository.getUnavailableDatesForClassroom(
        classroomId,
        lessonDates,
      );

    for (const { lessonId, lessonDateStr, startTime, endTime } of lessonTimeRanges) {
      //check overlap 
      const hasOverlap =
        await this.editClassroomRepository.hasOverlappingLessonInClassroom(
          classroomId,
          lessonDateStr,
          startTime,
          endTime,
          lessonId,
          locationId,
        );

      if (hasOverlap) {
        throw new BadRequestException('Classroom already chosen!');
      }

      //check unavailability
      if (unavailableDates.has(lessonDateStr)) {
        throw new BadRequestException('Classroom is unavailable');
      }
    }

    //perform bulk update (classroomId may be null to clear classroom)
    await this.editClassroomRepository.updateClassroomForLessons(
      lessons.map((l) => l.id),
      classroomId,
    );

    return {
      updatedLessonIds: lessons.map((l) => l.id),
    };
  }
}
