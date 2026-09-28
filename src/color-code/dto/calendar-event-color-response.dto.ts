import { Expose, Type } from 'class-transformer';

export class CalendarEventColorResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  color: string;
}

export class CalendarEventColorListResponseDto {
  @Expose()
  @Type(() => CalendarEventColorResponseDto)
  body: CalendarEventColorResponseDto[];
}


export class CalendarEventColorApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Calendar event colors fetched successfully';

  @Expose()
  @Type(() => CalendarEventColorResponseDto)
  data: CalendarEventColorResponseDto[];
}
