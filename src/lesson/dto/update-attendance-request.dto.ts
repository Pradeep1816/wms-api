import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateAttendanceRequestDto {
  @IsBoolean()
  @IsNotEmpty()
  present: boolean;
}
