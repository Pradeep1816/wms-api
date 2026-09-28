import { Expose } from 'class-transformer';

export class AvailabilityResponseDto {
  @Expose()
  from: string;

  @Expose()
  to: string;
}

export class HolidayResponseDto {
  @Expose()
  id: number;

  @Expose()
  date: Date;

  @Expose()
  description: string;

  @Expose()
  isDeleted: boolean;
}

export class ScheduleDetailsResponseDto {
  @Expose()
  Availabilities: AvailabilityResponseDto;

  @Expose()
  OperationTimeAvailability: AvailabilityResponseDto;

  @Expose()
  Holiday: HolidayResponseDto | null;
}
