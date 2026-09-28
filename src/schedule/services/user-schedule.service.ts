import { Injectable } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { RenderDayEventsResponseDto } from '../dto/render-day-events-response.dto';
import { CustomerUserScheduleRepository } from '../repositories/user-schedule.repository';
import { RenderDayEventsRequestDto } from '../dto/render-day-events-request.dto';

@Injectable()
export class CustomerUserScheduleService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly customerUserScheduleRepository: CustomerUserScheduleRepository,
  ) {}

  async renderCustomerDayEvents(
    locationId: number,
    locationSlug: string,
    date: string | undefined,
    customerId: number,
  ): Promise<RenderDayEventsResponseDto> {
    try {
      const targetDate = new Date(
        date || new Date().toISOString().split('T')[0],
      );
      const formattedDate = targetDate.toISOString().split('T')[0];

      const lessons =
        await this.customerUserScheduleRepository.findCustomerLessonsByDate(
          formattedDate,
          customerId,
          locationId,
        );
      const customerLessonIds = new Set(lessons.map((lesson) => lesson.id));

      if (customerLessonIds.size === 0) {
        return {
          lessons: [],
          availability: [],
          totalEvents: 0,
          date: formattedDate,
          locationId,
        };
      }

      const request: RenderDayEventsRequestDto = {
        ScheduleSearch: {
          date: formattedDate,
          showAll: false,
        },
      };

      const allEvents = await this.scheduleService.renderDayEvents(
        locationId,
        locationSlug,
        request,
        'user',
      );
      const lessonEvents = allEvents.lessons.filter((event) =>
        customerLessonIds.has(event.lessonId),
      );

      return {
        lessons: lessonEvents,
        availability: [],
        totalEvents: lessonEvents.length,
        date: formattedDate,
        locationId,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to render customer day events: ${message}`);
    }
  }
}
