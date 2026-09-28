import { Injectable } from '@nestjs/common';
import { DailyScheduleRequestDto } from '../dto/daily-schedule-request.dto';
import { DailyScheduleDataDto } from '../dto/daily-schedule-response.dto';
import { formatDateToEasternString } from '../../utils/formatters';
import { DailyScheduleRepository } from '../repositories/daily-schedule.repository';
import { DailyScheduleTransformationService } from './transformations/daily-schedule-transformation.service';

@Injectable()
export class DailyScheduleService {
  constructor(
    private readonly dailyScheduleRepository: DailyScheduleRepository,
    private readonly dailyScheduleTransformationService: DailyScheduleTransformationService,
  ) {}

  async getDailySchedule(
    locationId: number,
    query: DailyScheduleRequestDto,
  ): Promise<DailyScheduleDataDto> {
    const targetDate = query.date || formatDateToEasternString();

    const [rescheduledLeafDateMap, colorMap] = await Promise.all([
      this.dailyScheduleRepository.getRescheduledLeafDateMap(
        locationId,
        targetDate,
      ),
      this.dailyScheduleRepository.getCalendarEventColorMap(),
    ]);

    const rescheduledRootIds = [...rescheduledLeafDateMap.keys()];

    const lessons = await this.dailyScheduleRepository.getDailyScheduleLessons(
      locationId,
      targetDate,
      rescheduledRootIds,
    );
    const courseIds = [
      ...new Set(
        lessons
          .map((lesson) => Number(lesson.courseId))
          .filter((courseId) => Number.isFinite(courseId) && courseId > 0),
      ),
    ];
    const firstNonCanceledLessonIdMap =
      await this.dailyScheduleRepository.getFirstNonCanceledLessonIdMap(
        courseIds,
      );

    const body =
      this.dailyScheduleTransformationService.transformLessonsToDailyScheduleDtos(
        lessons,
        rescheduledLeafDateMap,
        colorMap,
        firstNonCanceledLessonIdMap,
      );

    return {
      body,
      date: targetDate,
    };
  }
}
