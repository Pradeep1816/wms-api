import { BadRequestException, Injectable } from '@nestjs/common';
import { PrivateLessonBulkRescheduleService } from '../../lesson/services/private-lesson-actions/private-lesson-bulk-reschedule.service';
import { PrivateLessonBulkRescheduleRepository } from '../../lesson/repositories/private-lesson-actions/private-lesson-bulk-reschedule.repository';
import { TeacherBulkRescheduleRequestDto } from '../dto/teacher-bulk-reschedule-request.dto';

@Injectable()
export class TeacherBulkRescheduleService {
  constructor(
    private readonly privateLessonBulkRescheduleRepository: PrivateLessonBulkRescheduleRepository,
    private readonly privateLessonBulkRescheduleService: PrivateLessonBulkRescheduleService,
  ) {}

  async bulkRescheduleByTeacher(
    locationId: number,
    teacherId: number,
    dto: TeacherBulkRescheduleRequestDto,
    loggedUserId: number,
  ): Promise<{
    message: string;
    rescheduledLessons: { oldLessonId: number; newLessonId: number }[];
  }> {
    const sourceDate = dto.sourceDate;
    const destinationDate = dto.destinationDate;
    if (!sourceDate || !destinationDate) {
      throw new BadRequestException('sourceDate and destinationDate are required');
    }

    const lessonIds =
      await this.privateLessonBulkRescheduleRepository.findPrivateLessonIdsByTeacherAndDate(
        teacherId,
        locationId,
        sourceDate,
      );

    if (lessonIds.length === 0) {
      throw new BadRequestException(
        'No Lessons for this teacher for the selected date',
      );
    }

    return this.privateLessonBulkRescheduleService.bulkReschedule(
      locationId,
      { lessonIds, newDate: destinationDate },
      loggedUserId,
    );
  }
}
