import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { LocationAvailability } from '../../entities/location-availability.entity';
import { LocationRenderEventDto } from '../../dto/location-availability-response.dto';

const dayjs = require('dayjs');

const RENDER_EVENT_BACKGROUND_COLOR = '#97ef83';
const RENDER_EVENT_CLASS_NAME = 'location-availability';

@Injectable()
export class LocationAvailabilityTransformationService {

  // Transform location availability to FullCalendar-style events (render-events)
  toRenderEvents(
    entities: LocationAvailability[],
    referenceDate: string, //
  ): LocationRenderEventDto[] {
    const events: LocationRenderEventDto[] = [];

    for (const entity of entities) {

      const start = this.combineDateWithTime(dayjs(referenceDate), entity.fromTime);
      const end = this.combineDateWithTime(dayjs(referenceDate), entity.toTime);

      events.push(
        plainToInstance(
          LocationRenderEventDto,
          {
            id: entity.id,
            resourceId: String(entity.day),
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            backgroundColor: RENDER_EVENT_BACKGROUND_COLOR,
            className: RENDER_EVENT_CLASS_NAME,
          },
          { excludeExtraneousValues: true },
        ),
      );
    }

    return events;
  }

  private combineDateWithTime(date: any, timeString: string): any {
    const [hours = 0, minutes = 0, seconds = 0] = timeString
      .split(':')
      .map((s) => parseInt(s, 10) || 0);
    return date.hour(hours).minute(minutes).second(seconds).millisecond(0);
  }

  private formatDateTime(date: any): string {
    return date.format('YYYY-MM-DD HH:mm:ss');
  }
}
