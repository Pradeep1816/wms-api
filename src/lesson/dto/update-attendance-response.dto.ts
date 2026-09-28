import { Expose } from 'class-transformer';

export class UpdateAttendanceResponseDto {
  @Expose()
  id: number;

  @Expose()
  present: boolean;
}
