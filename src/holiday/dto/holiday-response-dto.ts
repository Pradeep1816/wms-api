import { Expose, Type } from 'class-transformer';

export class HolidayItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  description: string;
}

export class HolidayListResponseDto {
  @Expose()
  @Type(() => HolidayItemDto)
  body: HolidayItemDto[];

  @Expose()
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
