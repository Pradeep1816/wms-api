import { Expose, Type } from 'class-transformer';

/** Single event for FullCalendar (location availability render-events). */
export class LocationRenderEventDto {
  @Expose()
  id: number;

  @Expose()
  resourceId: string;

  @Expose()
  start: string;

  @Expose()
  end: string;

  @Expose()
  backgroundColor: string;

  @Expose()
  className: string;
}

export class LocationRenderEventsResponseDto {
  @Expose()
  @Type(() => LocationRenderEventDto)
  body: LocationRenderEventDto[];
}
