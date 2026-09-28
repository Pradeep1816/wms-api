import { Injectable } from '@nestjs/common';
import { CalendarEventColor } from '../../entities/calendar-event-color.entity';
import { CalendarEventColorResponseDto } from '../../dto/calendar-event-color-response.dto';

@Injectable()
export class CalendarEventColorTransformationService {

  transformRow(item: CalendarEventColor): CalendarEventColorResponseDto {
    return {
      id: item.id,
      name: item.name,
      color: item.code,  
    };
  }

  transformRows(items: CalendarEventColor[]): CalendarEventColorResponseDto[] {
    return items.map(i => this.transformRow(i));
  }
}

