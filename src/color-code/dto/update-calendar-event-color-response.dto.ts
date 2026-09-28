import { Expose } from 'class-transformer';

export class UpdateCalendarEventColorResponseDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  

  @Expose()
  updatedByUserId: number;
}
